/**
 * X API とのやり取りを抽象化した型。
 * X API の仕様変更時は services/x 配下のみを修正すれば済むよう、アプリの他の部分はこの型だけを使う。
 */

export interface XTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  /** 秒 */
  expiresIn: number;
  scope: string;
}

export interface XUserProfile {
  id: string;
  username: string;
  name: string;
  profileImageUrl: string | null;
}

export interface XCreatedPost {
  id: string;
}

export interface AuthorizeParams {
  state: string;
  codeChallenge: string;
  /** 再認証対象（モックでのみ使用。実際の X ではブラウザでログイン中のアカウントが使われる） */
  reauthHint?: { id: string; username: string; name: string };
}

export interface XClient {
  readonly isMock: boolean;
  /** X 公式の認可画面 URL を作る */
  buildAuthorizeUrl(params: AuthorizeParams): string;
  exchangeCode(params: { code: string; codeVerifier: string }): Promise<XTokenResponse>;
  refreshToken(refreshToken: string): Promise<XTokenResponse>;
  revokeToken(token: string): Promise<void>;
  getMe(accessToken: string): Promise<XUserProfile>;
  createPost(accessToken: string, text: string): Promise<XCreatedPost>;
}

/** OAuth 2.0 で要求するスコープ（投稿・自分のプロフィール取得・リフレッシュトークン） */
export const X_OAUTH_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"] as const;
