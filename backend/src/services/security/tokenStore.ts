import { getSecretStore } from "./secretStore.js";

/** アカウント単位で保持する OAuth トークン */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
  /** アクセストークンの有効期限（epoch ms） */
  expiresAt: number;
  scope: string;
}

const keyFor = (xUserId: string) => `x-account:${xUserId}`;

export const tokenStore = {
  async get(xUserId: string): Promise<StoredTokens | null> {
    const raw = await (await getSecretStore()).get(keyFor(xUserId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredTokens;
    } catch {
      return null;
    }
  },
  async set(xUserId: string, tokens: StoredTokens): Promise<void> {
    await (await getSecretStore()).set(keyFor(xUserId), JSON.stringify(tokens));
  },
  async delete(xUserId: string): Promise<void> {
    await (await getSecretStore()).delete(keyFor(xUserId));
  },
};
