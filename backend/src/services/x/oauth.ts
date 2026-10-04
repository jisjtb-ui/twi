import crypto from "node:crypto";
import { accountsRepo, type Account } from "../../database/repositories.js";
import { AppError, toAppError } from "../../errors.js";
import { tokenStore } from "../security/tokenStore.js";
import { toStoredTokens, withAccountLock } from "./accountAuth.js";
import { getXClient } from "./client.js";

/**
 * 「アカウント追加」「再認証」の OAuth 2.0 (Authorization Code + PKCE) フロー。
 *
 * 1. start(): state と code_verifier を生成し、X 公式の認可 URL を返す
 * 2. 利用者はブラウザで X にログインして認可（ID/パスワードは X 側でのみ入力され、本アプリは一切扱わない）
 * 3. X が callback URL へリダイレクト → handleCallback() でトークン取得・プロフィール取得・保存
 * 4. フロントエンドは status(state) をポーリングして完了を検知
 */

const FLOW_TTL_MS = 15 * 60 * 1000;

type FlowStatus =
  | { status: "pending" }
  | { status: "success"; account: Account; reauth: boolean }
  | { status: "error"; message: string };

interface Flow {
  codeVerifier: string;
  createdAt: number;
  reauthAccountId: number | null;
  result: FlowStatus;
}

const flows = new Map<string, Flow>();

function cleanup(): void {
  const now = Date.now();
  for (const [state, flow] of flows) {
    if (now - flow.createdAt > FLOW_TTL_MS) flows.delete(state);
  }
}

export function startOAuth(reauthAccountId: number | null): { state: string; authorizeUrl: string } {
  cleanup();
  const client = getXClient();
  let reauthHint: { id: string; username: string; name: string } | undefined;
  if (reauthAccountId !== null) {
    const account = accountsRepo.get(reauthAccountId);
    if (!account) throw new AppError("NOT_FOUND", "アカウントが見つかりません", 404);
    reauthHint = { id: account.xUserId, username: account.username, name: account.displayName };
  }
  const state = crypto.randomBytes(24).toString("base64url");
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  flows.set(state, { codeVerifier, createdAt: Date.now(), reauthAccountId, result: { status: "pending" } });
  return { state, authorizeUrl: client.buildAuthorizeUrl({ state, codeChallenge, reauthHint }) };
}

export function getOAuthStatus(state: string): FlowStatus {
  const flow = flows.get(state);
  if (!flow) return { status: "error", message: "認証の有効期限が切れました。もう一度「アカウント追加」からやり直してください" };
  return flow.result;
}

/** X からのリダイレクトを処理する。戻り値は結果ページに表示する文言 */
export async function handleCallback(query: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
  const state = typeof query.state === "string" ? query.state : "";
  const flow = flows.get(state);
  if (!flow) {
    return { ok: false, message: "認証セッションが見つからないか期限切れです。アプリの「アカウント追加」からやり直してください。" };
  }
  if (flow.result.status !== "pending") {
    return { ok: flow.result.status === "success", message: "この認証は既に処理済みです。アプリに戻ってください。" };
  }

  const fail = (message: string) => {
    flow.result = { status: "error", message };
    return { ok: false, message };
  };

  if (typeof query.error === "string") {
    return fail(
      query.error === "access_denied"
        ? "X 側で認可がキャンセルされました。"
        : `X の認可に失敗しました: ${query.error_description ?? query.error}`,
    );
  }
  const code = typeof query.code === "string" ? query.code : "";
  if (!code) return fail("X から認可コードが返されませんでした。");

  try {
    const client = getXClient();
    const tokenRes = await client.exchangeCode({ code, codeVerifier: flow.codeVerifier });
    const profile = await client.getMe(tokenRes.accessToken);

    if (flow.reauthAccountId !== null) {
      const target = accountsRepo.get(flow.reauthAccountId);
      if (target && target.xUserId !== profile.id) {
        // 別アカウントのトークンは保存しない
        try {
          await client.revokeToken(tokenRes.refreshToken ?? tokenRes.accessToken);
        } catch {
          /* ignore */
        }
        return fail(
          `再認証したアカウント（@${profile.username}）が対象（@${target.username}）と異なります。` +
            `ブラウザの X で @${target.username} に切り替えてから、もう一度「再認証」を押してください。`,
        );
      }
    }

    const existing = accountsRepo.getByXUserId(profile.id);
    const saveTokens = async () => tokenStore.set(profile.id, toStoredTokens(tokenRes));
    // 既存アカウントの場合は投稿処理と競合しないようロックを取ってトークンを差し替える
    if (existing) await withAccountLock(existing.id, saveTokens);
    else await saveTokens();

    const account = accountsRepo.upsert({
      xUserId: profile.id,
      username: profile.username,
      displayName: profile.name,
      avatarUrl: profile.profileImageUrl,
      isMock: client.isMock,
    });
    flow.result = { status: "success", account, reauth: Boolean(existing) };
    return {
      ok: true,
      message: existing
        ? `@${account.username} を再接続しました。`
        : `@${account.username} を追加しました。`,
    };
  } catch (err) {
    const appErr = toAppError(err);
    console.error("[oauth] callback failed:", appErr.message);
    return fail(appErr.message);
  }
}
