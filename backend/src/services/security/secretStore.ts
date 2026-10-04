import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";

/**
 * 秘密情報（OAuth トークン）の保存先。SQLite には保存しない。
 *
 * - KeychainSecretStore: OS の資格情報ストア（macOS Keychain / Windows Credential Manager /
 *   Linux Secret Service）。@napi-rs/keyring を利用。
 * - EncryptedFileSecretStore: AES-256-GCM で暗号化したファイル（data/secrets.enc.json）。
 *   OS ストアが使えない環境（ヘッドレス Linux 等）向けのフォールバック。
 *
 * Tauri へ移行する場合は、この interface の実装を Tauri の keyring / stronghold プラグインに差し替える。
 */
export interface SecretStore {
  readonly kind: "keychain" | "file";
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

const SERVICE_NAME = "x-multi-poster";

// ───────────────────────── OS Keychain ─────────────────────────

type KeyringModule = typeof import("@napi-rs/keyring");

class KeychainSecretStore implements SecretStore {
  readonly kind = "keychain" as const;
  constructor(private readonly keyring: KeyringModule) {}

  private entry(key: string) {
    return new this.keyring.AsyncEntry(SERVICE_NAME, key);
  }
  async get(key: string): Promise<string | null> {
    try {
      return (await this.entry(key).getPassword()) ?? null;
    } catch {
      return null;
    }
  }
  async set(key: string, value: string): Promise<void> {
    await this.entry(key).setPassword(value);
  }
  async delete(key: string): Promise<void> {
    try {
      await this.entry(key).deleteCredential();
    } catch {
      // 存在しない場合は無視
    }
  }
}

// ───────────────────────── 暗号化ファイル ─────────────────────────

interface EncryptedRecord {
  iv: string;
  tag: string;
  data: string;
}

class EncryptedFileSecretStore implements SecretStore {
  readonly kind = "file" as const;
  private readonly filePath: string;
  private readonly key: Buffer;

  constructor(dataDir: string, keyMaterial: string) {
    this.filePath = path.join(dataDir, "secrets.enc.json");
    this.key = keyMaterial
      ? crypto.scryptSync(keyMaterial, "x-multi-poster/secret-store", 32)
      : loadOrCreateKeyFile(path.join(dataDir, "secret.key"));
  }

  private readAll(): Record<string, EncryptedRecord> {
    if (!fs.existsSync(this.filePath)) return {};
    return JSON.parse(fs.readFileSync(this.filePath, "utf8")) as Record<string, EncryptedRecord>;
  }
  private writeAll(records: Record<string, EncryptedRecord>): void {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(records, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }

  async get(key: string): Promise<string | null> {
    const rec = this.readAll()[key];
    if (!rec) return null;
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, Buffer.from(rec.iv, "base64"));
      decipher.setAAD(Buffer.from(key));
      decipher.setAuthTag(Buffer.from(rec.tag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(rec.data, "base64")), decipher.final()]).toString("utf8");
    } catch {
      // 鍵が変わった等で復号できない場合は「無い」扱い（＝再認証が必要）
      console.warn(`[security] 秘密情報を復号できませんでした: ${key}`);
      return null;
    }
  }
  async set(key: string, value: string): Promise<void> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(key));
    const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const records = this.readAll();
    records[key] = {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
    this.writeAll(records);
  }
  async delete(key: string): Promise<void> {
    const records = this.readAll();
    if (key in records) {
      delete records[key];
      this.writeAll(records);
    }
  }
}

function loadOrCreateKeyFile(keyPath: string): Buffer {
  if (fs.existsSync(keyPath)) {
    const key = Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "base64");
    if (key.length === 32) return key;
    throw new Error(`${keyPath} の形式が不正です`);
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, key.toString("base64"), { mode: 0o600 });
  return key;
}

// ───────────────────────── 選択 ─────────────────────────

async function tryKeychain(): Promise<SecretStore | null> {
  try {
    const keyring = (await import("@napi-rs/keyring")) as KeyringModule;
    const store = new KeychainSecretStore(keyring);
    // 実際に読み書きできるか確認（Linux で Secret Service が無い場合などは失敗する）
    const probeKey = "__probe__";
    const probeValue = crypto.randomUUID();
    await store.set(probeKey, probeValue);
    const ok = (await store.get(probeKey)) === probeValue;
    await store.delete(probeKey);
    return ok ? store : null;
  } catch {
    return null;
  }
}

let storePromise: Promise<SecretStore> | null = null;

export function getSecretStore(): Promise<SecretStore> {
  storePromise ??= (async () => {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const mode = config.security.secretStore;
    if (mode !== "file") {
      const keychain = await tryKeychain();
      if (keychain) return keychain;
      if (mode === "keychain") {
        throw new Error("SECRET_STORE=keychain が指定されていますが、OS の資格情報ストアを利用できません");
      }
      console.warn("[security] OS の資格情報ストアを利用できないため、暗号化ファイルに保存します");
    }
    return new EncryptedFileSecretStore(config.dataDir, config.security.encryptionKey);
  })();
  return storePromise;
}
