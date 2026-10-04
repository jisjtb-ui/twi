import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** リポジトリのルート（backend/src or backend/dist から2階層上） */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// .env はアプリ開発者が初期構築時に一度だけ用意する。利用者がアカウントごとに触ることはない。
const envPath = process.env.X_MULTI_POSTER_ENV ?? path.join(ROOT_DIR, ".env");
if (fs.existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

function bool(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

const port = Number(process.env.PORT ?? 8787);

export const config = {
  port,
  /** ローカル専用。外部からアクセスさせない */
  host: process.env.HOST ?? "127.0.0.1",
  dataDir: path.resolve(ROOT_DIR, process.env.DATA_DIR ?? "data"),
  /** フロントエンドの URL（OAuth 完了後に戻る先） */
  appUrl: process.env.APP_URL ?? `http://127.0.0.1:${port}`,
  x: {
    clientId: process.env.X_CLIENT_ID ?? "",
    /** Confidential client（Web App 種別）の場合のみ。Native App 種別なら空でよい */
    clientSecret: process.env.X_CLIENT_SECRET ?? "",
    callbackUrl: process.env.X_CALLBACK_URL ?? `http://127.0.0.1:${port}/api/oauth/callback`,
    /** 開発用：X API を呼ばずダミーアカウントで動作させる */
    mock: bool(process.env.X_MOCK),
  },
  security: {
    /** auto | keychain | file */
    secretStore: (process.env.SECRET_STORE ?? "auto") as "auto" | "keychain" | "file",
    /** file 方式の暗号鍵（未指定なら data/secret.key を自動生成） */
    encryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? "",
  },
} as const;

export type AppConfig = typeof config;
