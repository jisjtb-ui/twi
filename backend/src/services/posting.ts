import { accountsRepo, historyRepo, settingsRepo, type HistoryItem, type PostSource } from "../database/repositories.js";
import { nowIso } from "../database/db.js";
import { AppError, toAppError } from "../errors.js";
import { withAccessToken } from "./x/accountAuth.js";
import { getXClient } from "./x/client.js";
import { RateLimitError } from "./x/errors.js";

export interface PostResult {
  accountId: number;
  username: string;
  ok: boolean;
  xPostId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  /** レート制限の解除時刻（epoch 秒） */
  rateLimitResetAt: number | null;
  history: HistoryItem | null;
}

// ───────── レート制限中のアカウントは解除時刻まで X API を呼ばない（制限の回避はしない） ─────────

const RATE_LIMIT_KEY = "rateLimitResets";

function getRateLimitReset(accountId: number): number | null {
  const map = settingsRepo.get<Record<string, number>>(RATE_LIMIT_KEY, {});
  const reset = map[String(accountId)];
  return reset && reset * 1000 > Date.now() ? reset : null;
}

function setRateLimitReset(accountId: number, resetAt: number | null): void {
  const map = settingsRepo.get<Record<string, number>>(RATE_LIMIT_KEY, {});
  const now = Date.now() / 1000;
  for (const [k, v] of Object.entries(map)) if (v < now) delete map[k];
  if (resetAt) map[String(accountId)] = resetAt;
  else delete map[String(accountId)];
  settingsRepo.set(RATE_LIMIT_KEY, map);
}

export function validatePostText(raw: unknown): string {
  if (typeof raw !== "string") throw new AppError("BAD_REQUEST", "投稿内容が不正です");
  const text = raw.trim();
  if (!text) throw new AppError("BAD_REQUEST", "投稿内容を入力してください");
  return text;
}

/**
 * 1アカウントへ投稿し、結果を履歴に記録する。例外は投げず結果オブジェクトで返す
 * （一括投稿で1件失敗しても他を継続するため）。
 * 投稿の自動リトライはしない（タイムアウト時に X 側で投稿済みの可能性があり、二重投稿になるため）。
 */
export async function postToAccount(
  accountId: number,
  text: string,
  source: PostSource,
  postPoolId: number | null = null,
): Promise<PostResult> {
  const account = accountsRepo.get(accountId);
  const username = account?.username ?? `#${accountId}`;
  let xPostId: string | null = null;
  let error: AppError | null = null;

  if (!account) {
    error = new AppError("NOT_FOUND", "アカウントが見つかりません", 404);
  } else if (account.status === "reauth_required") {
    error = new AppError("AUTH_EXPIRED", "再認証が必要です。アカウント一覧の「再認証」から X にログインし直してください", 401);
  } else if (getRateLimitReset(accountId)) {
    error = new RateLimitError(getRateLimitReset(accountId));
  } else {
    try {
      const created = await withAccessToken(accountId, (token) => getXClient().createPost(token, text));
      xPostId = created.id;
    } catch (err) {
      error = toAppError(err);
      if (error instanceof RateLimitError) {
        // 解除時刻が不明な場合は15分（X の標準ウィンドウ）待つ
        setRateLimitReset(accountId, error.resetAt ?? Math.floor(Date.now() / 1000) + 15 * 60);
      }
    }
  }

  const postedAt = nowIso();
  if (account && xPostId) accountsRepo.setLastPostAt(account.id, postedAt);
  const history = account
    ? historyRepo.add({
        accountId: account.id,
        accountUsername: account.username,
        content: text,
        xPostId,
        status: xPostId ? "success" : "failed",
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
        source,
        postPoolId,
        postedAt,
      })
    : null;

  if (error) console.warn(`[post] @${username} 失敗 ${error.code}: ${error.message}`);
  else console.log(`[post] @${username} 成功 id=${xPostId}`);

  return {
    accountId,
    username,
    ok: Boolean(xPostId),
    xPostId,
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
    rateLimitResetAt: error instanceof RateLimitError ? error.resetAt : null,
    history,
  };
}
