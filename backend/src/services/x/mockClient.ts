import crypto from "node:crypto";
import { AppError } from "../../errors.js";
import { networkError, RateLimitError } from "./errors.js";
import type { AuthorizeParams, XClient, XCreatedPost, XTokenResponse, XUserProfile } from "./types.js";

/**
 * 開発・動作確認用のモック（X_MOCK=true）。X API を一切呼ばない。
 * ログイン画面は作らず、認可 URL として直接コールバック URL を返す（偽のログインフォームは作らない）。
 * トークンにダミーユーザー情報を埋め込むため、再起動後もそのまま動作する。
 *
 * 投稿本文に次の文字列を含めるとエラーを再現できる:
 *   [mock:ratelimit] [mock:network] [mock:duplicate] [mock:auth] [mock:error] [mock:payment]
 */
export class MockXClient implements XClient {
  readonly isMock = true;

  constructor(private readonly callbackUrl: string) {}

  buildAuthorizeUrl({ state, reauthHint }: AuthorizeParams): string {
    const n = crypto.randomBytes(2).toString("hex");
    const user: XUserProfile = reauthHint
      ? { id: reauthHint.id, username: reauthHint.username, name: reauthHint.name, profileImageUrl: null }
      : { id: `mock-${crypto.randomUUID()}`, username: `dummy_${n}`, name: `ダミー ${n}`, profileImageUrl: null };
    const url = new URL(this.callbackUrl);
    url.searchParams.set("state", state);
    url.searchParams.set("code", encode(user));
    return url.toString();
  }

  async exchangeCode({ code }: { code: string; codeVerifier: string }): Promise<XTokenResponse> {
    return this.issue(decode(code));
  }

  async refreshToken(refreshToken: string): Promise<XTokenResponse> {
    const user = decode(refreshToken.replace(/^r\./, ""));
    if (!user) throw new AppError("TOKEN_REFRESH_FAILED", "トークンの更新に失敗しました", 400);
    return this.issue(user);
  }

  async revokeToken(): Promise<void> {}

  async getMe(accessToken: string): Promise<XUserProfile> {
    const user = decode(accessToken);
    if (!user) throw new AppError("AUTH_EXPIRED", "認証の有効期限が切れています。再認証してください", 401);
    return user;
  }

  async createPost(accessToken: string, text: string): Promise<XCreatedPost> {
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 400));
    if (!decode(accessToken) || text.includes("[mock:auth]"))
      throw new AppError("AUTH_EXPIRED", "認証の有効期限が切れています。再認証してください", 401);
    if (text.includes("[mock:ratelimit]")) throw new RateLimitError(Math.floor(Date.now() / 1000) + 15 * 60);
    if (text.includes("[mock:network]")) throw networkError(new Error("ECONNRESET"));
    if (text.includes("[mock:duplicate]"))
      throw new AppError("DUPLICATE_CONTENT", "同じ内容の投稿としてXに拒否されました（重複投稿）", 403);
    if (text.includes("[mock:payment]"))
      throw new AppError("PAYMENT_REQUIRED", "X APIのクレジット残高不足または利用上限により実行できません", 402);
    if (text.includes("[mock:error]")) throw new AppError("X_API_ERROR", "X APIエラー (HTTP 400): mock", 502);
    return { id: `${Date.now()}${Math.floor(Math.random() * 1000)}` };
  }

  private issue(user: XUserProfile | null): XTokenResponse {
    if (!user) throw new AppError("OAUTH_FAILED", "X の認証に失敗しました（モック）", 400);
    const token = encode(user);
    return { accessToken: token, refreshToken: `r.${token}`, expiresIn: 7200, scope: "mock" };
  }
}

function encode(user: XUserProfile): string {
  return `mock.${Buffer.from(JSON.stringify(user)).toString("base64url")}`;
}

function decode(token: string): XUserProfile | null {
  if (!token.startsWith("mock.")) return null;
  try {
    return JSON.parse(Buffer.from(token.slice(5), "base64url").toString("utf8")) as XUserProfile;
  } catch {
    return null;
  }
}
