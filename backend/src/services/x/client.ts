import { config } from "../../config.js";
import { AppError } from "../../errors.js";
import { MockXClient } from "./mockClient.js";
import { RealXClient } from "./realClient.js";
import type { XClient } from "./types.js";

let client: XClient | null = null;

export function getXClient(): XClient {
  if (client) return client;
  if (config.x.mock) {
    client = new MockXClient(config.x.callbackUrl);
  } else {
    if (!config.x.clientId) {
      throw new AppError(
        "CONFIG_MISSING",
        "X_CLIENT_ID が設定されていません。README の「初期設定」に従って .env を設定し、アプリを再起動してください",
        500,
      );
    }
    client = new RealXClient({
      clientId: config.x.clientId,
      clientSecret: config.x.clientSecret,
      callbackUrl: config.x.callbackUrl,
    });
  }
  return client;
}

export function isXConfigured(): boolean {
  return config.x.mock || Boolean(config.x.clientId);
}
