/** アプリ全体で使うエラーコード。フロントエンドはこのコードと message をそのまま表示する */
export type ErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "CONFIG_MISSING"
  | "OAUTH_FAILED"
  | "AUTH_EXPIRED"
  | "TOKEN_REFRESH_FAILED"
  | "RATE_LIMIT"
  | "PAYMENT_REQUIRED"
  | "FORBIDDEN"
  | "DUPLICATE_CONTENT"
  | "DUPLICATE_REQUEST"
  | "ACCOUNT_BUSY"
  | "NETWORK_ERROR"
  | "X_API_ERROR"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly httpStatus = 400,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new AppError("INTERNAL", `内部エラー: ${message}`, 500);
}
