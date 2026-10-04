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
