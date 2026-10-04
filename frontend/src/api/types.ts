// バックエンド API のレスポンス型（backend/src/database/repositories.ts 等と対応）

export type AccountStatus = "connected" | "reauth_required";

export interface Account {
  id: number;
  xUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: AccountStatus;
  selected: boolean;
  isMock: boolean;
  lastPostAt: string | null;
  createdAt: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface Health {
  ok: boolean;
  mock: boolean;
  xConfigured: boolean;
  secretStore: "keychain" | "file";
}

export type OAuthStatus =
  | { status: "pending" }
  | { status: "success"; account: Account; reauth: boolean }
  | { status: "error"; message: string };

export interface HistoryItem {
  id: number;
  accountId: number | null;
  accountUsername: string;
  content: string;
  xPostId: string | null;
  status: "success" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
  source: "bulk" | "random";
  postPoolId: number | null;
  postedAt: string;
}

export interface PostResult {
  accountId: number;
  username: string;
  ok: boolean;
  xPostId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  rateLimitResetAt: number | null;
  history: HistoryItem | null;
}

export interface PoolItem {
  id: number;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
