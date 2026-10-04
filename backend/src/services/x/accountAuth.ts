import { accountsRepo, type Account } from "../../database/repositories.js";
import { AppError } from "../../errors.js";
import { tokenStore, type StoredTokens } from "../security/tokenStore.js";
import { getXClient } from "./client.js";
import type { XTokenResponse } from "./types.js";

/** 期限切れの少し前にリフレッシュする */
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

// ───────────────── アカウント単位の排他制御 ─────────────────
// X のリフレッシュトークンは1回しか使えないため、同一アカウントへの処理（投稿・トークン更新）は
// 必ず直列化する。一括投稿とランダム投稿が同時に同じアカウントを使っても衝突しない。

const chains = new Map<number, Promise<unknown>>();

export function withAccountLock<T>(accountId: number, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(accountId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  chains.set(accountId, next);
  void next.finally(() => {
    if (chains.get(accountId) === next) chains.delete(accountId);
  }).catch(() => undefined);
  return next;
}

export function isAccountBusy(accountId: number): boolean {
  return chains.has(accountId);
}

// ───────────────── トークン ─────────────────

export function toStoredTokens(res: XTokenResponse, previous?: StoredTokens | null): StoredTokens {
  return {
    accessToken: res.accessToken,
    // リフレッシュ時に新しいリフレッシュトークンが返らない場合は以前のものを保持
    refreshToken: res.refreshToken ?? previous?.refreshToken ?? null,
    expiresAt: Date.now() + res.expiresIn * 1000,
    scope: res.scope,
  };
}

async function markReauthRequired(account: Account): Promise<void> {
  accountsRepo.setStatus(account.id, "reauth_required");
}

/** 有効なアクセストークンを返す（必要ならリフレッシュ）。呼び出し側で withAccountLock を取ること */
async function getValidAccessToken(account: Account, forceRefresh = false): Promise<string> {
  const tokens = await tokenStore.get(account.xUserId);
  if (!tokens) {
    await markReauthRequired(account);
    throw new AppError("AUTH_EXPIRED", "認証情報が見つかりません。再認証してください", 401);
  }
  if (!forceRefresh && tokens.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    await markReauthRequired(account);
    throw new AppError("AUTH_EXPIRED", "認証の有効期限が切れています。再認証してください", 401);
  }
  try {
    const refreshed = await getXClient().refreshToken(tokens.refreshToken);
    await tokenStore.set(account.xUserId, toStoredTokens(refreshed, tokens));
    if (account.status !== "connected") accountsRepo.setStatus(account.id, "connected");
    return refreshed.accessToken;
  } catch (err) {
    if (err instanceof AppError && (err.code === "NETWORK_ERROR" || err.code === "X_API_ERROR" || err.code === "RATE_LIMIT")) {
      // 一時的な障害。リフレッシュトークンは消費されていない可能性が高いので再認証扱いにはしない
      throw err;
    }
    await markReauthRequired(account);
    throw new AppError(
      "TOKEN_REFRESH_FAILED",
      "トークンの更新に失敗しました。アカウントを再認証してください",
      401,
    );
  }
}

/**
 * アカウントのアクセストークンを使って処理を実行する。
 * - 同一アカウントの処理は直列化
 * - 期限切れ前に自動リフレッシュ
 * - 401 が返った場合は1回だけリフレッシュして再実行（401 は X 側で処理されていないため安全）
 */
export function withAccessToken<T>(accountId: number, fn: (accessToken: string, account: Account) => Promise<T>): Promise<T> {
  return withAccountLock(accountId, async () => {
    const account = accountsRepo.get(accountId);
    if (!account) throw new AppError("NOT_FOUND", "アカウントが見つかりません", 404);
    const token = await getValidAccessToken(account);
    try {
      return await fn(token, account);
    } catch (err) {
      if (err instanceof AppError && err.code === "AUTH_EXPIRED") {
        const retryToken = await getValidAccessToken(account, true);
        try {
          return await fn(retryToken, account);
        } catch (retryErr) {
          if (retryErr instanceof AppError && retryErr.code === "AUTH_EXPIRED") await markReauthRequired(account);
          throw retryErr;
        }
      }
      throw err;
    }
  });
}

/** アカウント削除時：トークンを失効させて（ベストエフォート）安全な保存先から削除 */
export async function forgetAccountTokens(account: Account): Promise<void> {
  await withAccountLock(account.id, async () => {
    const tokens = await tokenStore.get(account.xUserId);
    if (tokens) {
      try {
        const client = getXClient();
        if (tokens.refreshToken) await client.revokeToken(tokens.refreshToken);
        else await client.revokeToken(tokens.accessToken);
      } catch (err) {
        console.warn(`[x] トークン失効に失敗（無視）: @${account.username}`, err instanceof Error ? err.message : err);
      }
    }
    await tokenStore.delete(account.xUserId);
  });
}
