import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";

/**
 * SQLite 接続。秘密情報（アクセストークン等）はここには保存しない。
 * トークンは services/security の SecretStore が保持する。
 */
let db: DatabaseSync | null = null;

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE accounts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    x_user_id     TEXT    NOT NULL UNIQUE,
    username      TEXT    NOT NULL,
    display_name  TEXT    NOT NULL,
    avatar_url    TEXT,
    status        TEXT    NOT NULL DEFAULT 'connected', -- connected | reauth_required
    selected      INTEGER NOT NULL DEFAULT 1,
    is_mock       INTEGER NOT NULL DEFAULT 0,
    last_post_at  TEXT,
    created_at    TEXT    NOT NULL
  );

  CREATE TABLE post_pool (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    content     TEXT    NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  CREATE TABLE queue (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    post_pool_id  INTEGER REFERENCES post_pool(id) ON DELETE SET NULL,
    scheduled_at  TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'pending', -- pending | processing | done | failed | cancelled
    created_at    TEXT    NOT NULL,
    executed_at   TEXT
  );
  CREATE INDEX idx_queue_status_time ON queue(status, scheduled_at);
  CREATE INDEX idx_queue_account ON queue(account_id, status);

  CREATE TABLE post_history (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id       INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    account_username TEXT    NOT NULL,
    content          TEXT    NOT NULL,
    x_post_id        TEXT,
    status           TEXT    NOT NULL, -- success | failed
    error_code       TEXT,
    error_message    TEXT,
    source           TEXT    NOT NULL, -- bulk | random
    post_pool_id     INTEGER,
    posted_at        TEXT    NOT NULL
  );
  CREATE INDEX idx_history_time ON post_history(posted_at DESC);

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

function migrate(conn: DatabaseSync): void {
  const row = conn.prepare("PRAGMA user_version").get() as { user_version: number };
  let version = row.user_version;
  while (version < MIGRATIONS.length) {
    conn.exec("BEGIN");
    try {
      conn.exec(MIGRATIONS[version]);
      version += 1;
      conn.exec(`PRAGMA user_version = ${version}`);
      conn.exec("COMMIT");
    } catch (err) {
      conn.exec("ROLLBACK");
      throw err;
    }
  }
}

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(path.join(config.dataDir, "app.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

/** 同期トランザクション（node:sqlite は同期 API） */
export function transaction<T>(fn: () => T): T {
  const conn = getDb();
  conn.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
