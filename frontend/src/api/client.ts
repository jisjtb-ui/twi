import type { Account, ApiErrorBody } from "./types";

/**
 * フロントエンドとバックエンドの唯一の境界。
 * React コンポーネントは X API を直接呼ばず、必ずここを経由する。
 * 将来 Tauri へ移行する場合は、この fetch 部分を Tauri の invoke / sidecar 呼び出しに差し替える。
 */

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "アプリのバックエンドに接続できません。起動しているか確認してください", 0);
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(err?.code ?? "HTTP_ERROR", err?.message ?? `HTTP ${res.status}`, res.status);
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean; mock: boolean }>("GET", "/health"),

  // accounts
  listAccounts: () => request<Account[]>("GET", "/accounts"),
  setAccountSelected: (id: number, selected: boolean) =>
    request<Account>("PATCH", `/accounts/${id}`, { selected }),
  setAllSelected: (selected: boolean) => request<Account[]>("POST", "/accounts/select-all", { selected }),
  deleteAccount: (id: number) => request<{ ok: true }>("DELETE", `/accounts/${id}`),
  addMockAccount: () => request<Account>("POST", "/dev/mock-account"),
};
