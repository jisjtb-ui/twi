import { AppError } from "../../errors.js";
import { networkError, toXApiError } from "./errors.js";
import { X_OAUTH_SCOPES, type AuthorizeParams, type XClient, type XCreatedPost, type XTokenResponse, type XUserProfile } from "./types.js";

/** X 公式 API (v2) / OAuth 2.0 Authorization Code Flow with PKCE */
const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const API_BASE = "https://api.x.com/2";
const TIMEOUT_MS = 20_000;

interface RealClientOptions {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export class RealXClient implements XClient {
  readonly isMock = false;
  constructor(private readonly opts: RealClientOptions) {}

  buildAuthorizeUrl({ state, codeChallenge }: AuthorizeParams): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.opts.clientId);
    url.searchParams.set("redirect_uri", this.opts.callbackUrl);
    url.searchParams.set("scope", X_OAUTH_SCOPES.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  async exchangeCode({ code, codeVerifier }: { code: string; codeVerifier: string }): Promise<XTokenResponse> {
    return this.tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.opts.callbackUrl,
      code_verifier: codeVerifier,
    });
  }

  async refreshToken(refreshToken: string): Promise<XTokenResponse> {
    return this.tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  async revokeToken(token: string): Promise<void> {
    await this.fetchJson(`${API_BASE}/oauth2/revoke`, {
      method: "POST",
      headers: this.tokenHeaders(),
      body: new URLSearchParams({ token, client_id: this.opts.clientId }),
    }, "auth");
  }

  async getMe(accessToken: string): Promise<XUserProfile> {
    const body = (await this.fetchJson(
      `${API_BASE}/users/me?user.fields=profile_image_url`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      "user",
    )) as { data?: { id: string; username: string; name: string; profile_image_url?: string } };
    if (!body.data) throw new AppError("X_API_ERROR", "Xからアカウント情報を取得できませんでした", 502);
    return {
      id: body.data.id,
      username: body.data.username,
      name: body.data.name,
      // _normal (48x48) を少し大きい画像に
      profileImageUrl: body.data.profile_image_url?.replace("_normal.", "_bigger.") ?? null,
    };
  }

  async createPost(accessToken: string, text: string): Promise<XCreatedPost> {
    const body = (await this.fetchJson(
      `${API_BASE}/tweets`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
      "post",
    )) as { data?: { id: string } };
    if (!body.data?.id) throw new AppError("X_API_ERROR", "投稿IDが返されませんでした", 502);
    return { id: body.data.id };
  }

  // ───────── private ─────────

  private tokenHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    // Confidential client（Web App 種別）の場合のみ Basic 認証。Native App（public client）は client_id のみ
    if (this.opts.clientSecret) {
      const basic = Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString("base64");
      headers.Authorization = `Basic ${basic}`;
    }
    return headers;
  }

  private async tokenRequest(params: Record<string, string>): Promise<XTokenResponse> {
    const body = (await this.fetchJson(
      `${API_BASE}/oauth2/token`,
      {
        method: "POST",
        headers: this.tokenHeaders(),
        body: new URLSearchParams({ ...params, client_id: this.opts.clientId }),
      },
      "auth",
    )) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
    if (!body.access_token) throw new AppError("OAUTH_FAILED", "Xからアクセストークンを取得できませんでした", 400);
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? null,
      expiresIn: body.expires_in ?? 7200,
      scope: body.scope ?? "",
    };
  }

  private async fetchJson(url: string, init: RequestInit, context: "post" | "auth" | "user"): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw networkError(err);
    }
    const text = await res.text();
    let body: unknown = undefined;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = { detail: text.slice(0, 200) };
    }
    if (!res.ok) throw toXApiError(res.status, res.headers, body, context);
    return body;
  }
}
