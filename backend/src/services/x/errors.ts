import { AppError } from "../../errors.js";

/** X API のエラーレスポンスから人が読める詳細を取り出す */
function extractDetail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as Record<string, unknown>;
  if (typeof b.detail === "string") return b.detail;
  if (typeof b.error_description === "string") return b.error_description;
  if (Array.isArray(b.errors) && b.errors.length > 0) {
    const first = b.errors[0] as Record<string, unknown>;
    if (typeof first.message === "string") return first.message;
    if (typeof first.detail === "string") return first.detail;
  }
  if (typeof b.title === "string") return b.title;
  if (typeof b.error === "string") return b.error;
  return "";
}

function formatReset(resetEpochSec: number | null): string {
  if (!resetEpochSec) return "";
  const d = new Date(resetEpochSec * 1000);
  return `（解除予定 ${d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}）`;
}

/** レート制限エラー。解除時刻を保持し、スケジューラーが次回時刻の調整に使う */
export class RateLimitError extends AppError {
  constructor(public readonly resetAt: number | null) {
    super("RATE_LIMIT", `X APIの制限により投稿できません${formatReset(resetAt)}`, 429);
  }
}

/** HTTP レスポンスを AppError に変換する */
export function toXApiError(status: number, headers: Headers, body: unknown, context: "post" | "auth" | "user"): AppError {
  const detail = extractDetail(body);
  const suffix = detail ? `: ${detail}` : "";

  if (status === 429) {
    const reset = Number(headers.get("x-rate-limit-reset"));
    // 1日あたりの上限に到達した場合は x-user-limit-24hour-reset が返る
    const userReset = Number(headers.get("x-user-limit-24hour-reset"));
    const resetAt = Math.max(Number.isFinite(reset) ? reset : 0, Number.isFinite(userReset) ? userReset : 0) || null;
    return new RateLimitError(resetAt);
  }
  if (status === 401) {
    return new AppError("AUTH_EXPIRED", "認証の有効期限が切れています。再認証してください", 401);
  }
  if (status === 402) {
    return new AppError(
      "PAYMENT_REQUIRED",
      `X APIのクレジット残高不足または利用上限により実行できません。X Developer Console で残高・上限を確認してください${suffix}`,
      402,
    );
  }
  if (status === 403) {
    if (/duplicate/i.test(detail)) {
      return new AppError("DUPLICATE_CONTENT", "同じ内容の投稿としてXに拒否されました（重複投稿）", 403);
    }
    return new AppError(
      "FORBIDDEN",
      `Xに拒否されました。アプリの権限（Read and write）やアカウントの状態を確認してください${suffix}`,
      403,
    );
  }
  if (status >= 500) {
    return new AppError("X_API_ERROR", `X側で一時的なエラーが発生しました (HTTP ${status})${suffix}`, 502);
  }
  if (context === "auth") {
    return new AppError("OAUTH_FAILED", `X の認証に失敗しました (HTTP ${status})${suffix}`, 400);
  }
  return new AppError("X_API_ERROR", `X APIエラー (HTTP ${status})${suffix}`, 502);
}

export function networkError(err: unknown): AppError {
  const message = err instanceof Error ? err.message : String(err);
  return new AppError("NETWORK_ERROR", `ネットワークエラー：Xに接続できませんでした (${message})`, 503);
}
