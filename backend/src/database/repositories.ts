import { getDb, nowIso } from "./db.js";

// ───────────────────────── 型 ─────────────────────────

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

export interface PoolItem {
  id: number;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type QueueStatus = "pending" | "processing" | "done" | "failed" | "cancelled";

export interface QueueItem {
  id: number;
  accountId: number;
  postPoolId: number | null;
  scheduledAt: string;
  status: QueueStatus;
  createdAt: string;
  executedAt: string | null;
}

export type PostSource = "bulk" | "random";

export interface HistoryItem {
  id: number;
  accountId: number | null;
  accountUsername: string;
  content: string;
  xPostId: string | null;
  status: "success" | "failed";
  errorCode: string | null;
  errorMessage: string | null;
  source: PostSource;
  postPoolId: number | null;
  postedAt: string;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string => String(v);
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ───────────────────────── accounts ─────────────────────────

function toAccount(r: Row): Account {
  return {
    id: Number(r.id),
    xUserId: str(r.x_user_id),
    username: str(r.username),
    displayName: str(r.display_name),
    avatarUrl: strOrNull(r.avatar_url),
    status: str(r.status) as AccountStatus,
    selected: Number(r.selected) === 1,
    isMock: Number(r.is_mock) === 1,
    lastPostAt: strOrNull(r.last_post_at),
    createdAt: str(r.created_at),
  };
}

export const accountsRepo = {
  list(): Account[] {
    return (getDb().prepare("SELECT * FROM accounts ORDER BY id").all() as Row[]).map(toAccount);
  },
  get(id: number): Account | null {
    const r = getDb().prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Row | undefined;
    return r ? toAccount(r) : null;
  },
  getByXUserId(xUserId: string): Account | null {
    const r = getDb().prepare("SELECT * FROM accounts WHERE x_user_id = ?").get(xUserId) as Row | undefined;
    return r ? toAccount(r) : null;
  },
  /** 新規追加 or 既存アカウントのプロフィール更新（再認証時） */
  upsert(input: {
    xUserId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isMock?: boolean;
  }): Account {
    const db = getDb();
    const existing = this.getByXUserId(input.xUserId);
    if (existing) {
      db.prepare(
        `UPDATE accounts SET username = ?, display_name = ?, avatar_url = ?, status = 'connected' WHERE id = ?`,
      ).run(input.username, input.displayName, input.avatarUrl, existing.id);
      return this.get(existing.id)!;
    }
    const result = db
      .prepare(
        `INSERT INTO accounts (x_user_id, username, display_name, avatar_url, status, selected, is_mock, created_at)
         VALUES (?, ?, ?, ?, 'connected', 1, ?, ?)`,
      )
      .run(input.xUserId, input.username, input.displayName, input.avatarUrl, input.isMock ? 1 : 0, nowIso());
    return this.get(Number(result.lastInsertRowid))!;
  },
  setStatus(id: number, status: AccountStatus): void {
    getDb().prepare("UPDATE accounts SET status = ? WHERE id = ?").run(status, id);
  },
  setSelected(id: number, selected: boolean): void {
    getDb().prepare("UPDATE accounts SET selected = ? WHERE id = ?").run(selected ? 1 : 0, id);
  },
  setAllSelected(selected: boolean): void {
    getDb().prepare("UPDATE accounts SET selected = ?").run(selected ? 1 : 0);
  },
  setLastPostAt(id: number, at: string): void {
    getDb().prepare("UPDATE accounts SET last_post_at = ? WHERE id = ?").run(at, id);
  },
  delete(id: number): void {
    getDb().prepare("DELETE FROM accounts WHERE id = ?").run(id);
  },
};

// ───────────────────────── post_pool ─────────────────────────

function toPoolItem(r: Row): PoolItem {
  return {
    id: Number(r.id),
    content: str(r.content),
    enabled: Number(r.enabled) === 1,
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export const poolRepo = {
  list(): PoolItem[] {
    return (getDb().prepare("SELECT * FROM post_pool ORDER BY id").all() as Row[]).map(toPoolItem);
  },
  listEnabled(): PoolItem[] {
    return (getDb().prepare("SELECT * FROM post_pool WHERE enabled = 1 ORDER BY id").all() as Row[]).map(
      toPoolItem,
    );
  },
  get(id: number): PoolItem | null {
    const r = getDb().prepare("SELECT * FROM post_pool WHERE id = ?").get(id) as Row | undefined;
    return r ? toPoolItem(r) : null;
  },
  add(content: string): PoolItem {
    const now = nowIso();
    const result = getDb()
      .prepare("INSERT INTO post_pool (content, enabled, created_at, updated_at) VALUES (?, 1, ?, ?)")
      .run(content, now, now);
    return this.get(Number(result.lastInsertRowid))!;
  },
  update(id: number, patch: { content?: string; enabled?: boolean }): PoolItem | null {
    const current = this.get(id);
    if (!current) return null;
    getDb()
      .prepare("UPDATE post_pool SET content = ?, enabled = ?, updated_at = ? WHERE id = ?")
      .run(patch.content ?? current.content, (patch.enabled ?? current.enabled) ? 1 : 0, nowIso(), id);
    return this.get(id);
  },
  delete(id: number): void {
    getDb().prepare("DELETE FROM post_pool WHERE id = ?").run(id);
  },
};

// ───────────────────────── queue ─────────────────────────

function toQueueItem(r: Row): QueueItem {
  return {
    id: Number(r.id),
    accountId: Number(r.account_id),
    postPoolId: numOrNull(r.post_pool_id),
    scheduledAt: str(r.scheduled_at),
    status: str(r.status) as QueueStatus,
    createdAt: str(r.created_at),
    executedAt: strOrNull(r.executed_at),
  };
}

export const queueRepo = {
  listPending(): QueueItem[] {
    return (
      getDb().prepare("SELECT * FROM queue WHERE status = 'pending' ORDER BY scheduled_at").all() as Row[]
    ).map(toQueueItem);
  },
  pendingForAccount(accountId: number): QueueItem | null {
    const r = getDb()
      .prepare("SELECT * FROM queue WHERE account_id = ? AND status = 'pending' ORDER BY scheduled_at LIMIT 1")
      .get(accountId) as Row | undefined;
    return r ? toQueueItem(r) : null;
  },
  due(nowIsoStr: string): QueueItem[] {
    return (
      getDb()
        .prepare("SELECT * FROM queue WHERE status = 'pending' AND scheduled_at <= ? ORDER BY scheduled_at")
        .all(nowIsoStr) as Row[]
    ).map(toQueueItem);
  },
  add(accountId: number, postPoolId: number | null, scheduledAt: string): QueueItem {
    const result = getDb()
      .prepare(
        "INSERT INTO queue (account_id, post_pool_id, scheduled_at, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
      )
      .run(accountId, postPoolId, scheduledAt, nowIso());
    return toQueueItem(getDb().prepare("SELECT * FROM queue WHERE id = ?").get(Number(result.lastInsertRowid)) as Row);
  },
  /** pending → processing を原子的に行う。既に他で処理中なら false */
  claim(id: number): boolean {
    const result = getDb()
      .prepare("UPDATE queue SET status = 'processing' WHERE id = ? AND status = 'pending'")
      .run(id);
    return Number(result.changes) === 1;
  },
  finish(id: number, status: "done" | "failed" | "cancelled"): void {
    getDb().prepare("UPDATE queue SET status = ?, executed_at = ? WHERE id = ?").run(status, nowIso(), id);
  },
  reschedule(id: number, scheduledAt: string, postPoolId: number | null): void {
    getDb()
      .prepare("UPDATE queue SET scheduled_at = ?, post_pool_id = ? WHERE id = ? AND status = 'pending'")
      .run(scheduledAt, postPoolId, id);
  },
  cancelAllPending(): void {
    getDb().prepare("UPDATE queue SET status = 'cancelled', executed_at = ? WHERE status = 'pending'").run(nowIso());
  },
  cancelPendingForAccount(accountId: number): void {
    getDb()
      .prepare("UPDATE queue SET status = 'cancelled', executed_at = ? WHERE status = 'pending' AND account_id = ?")
      .run(nowIso(), accountId);
  },
  /** 異常終了などで processing のまま残った行を failed にする（起動時） */
  recoverProcessing(): number {
    const result = getDb()
      .prepare("UPDATE queue SET status = 'failed', executed_at = ? WHERE status = 'processing'")
      .run(nowIso());
    return Number(result.changes);
  },
};

// ───────────────────────── post_history ─────────────────────────

function toHistoryItem(r: Row): HistoryItem {
  return {
    id: Number(r.id),
    accountId: numOrNull(r.account_id),
    accountUsername: str(r.account_username),
    content: str(r.content),
    xPostId: strOrNull(r.x_post_id),
    status: str(r.status) as "success" | "failed",
    errorCode: strOrNull(r.error_code),
    errorMessage: strOrNull(r.error_message),
    source: str(r.source) as PostSource,
    postPoolId: numOrNull(r.post_pool_id),
    postedAt: str(r.posted_at),
  };
}

export const historyRepo = {
  list(limit = 100): HistoryItem[] {
    return (
      getDb().prepare("SELECT * FROM post_history ORDER BY posted_at DESC, id DESC LIMIT ?").all(limit) as Row[]
    ).map(toHistoryItem);
  },
  add(item: Omit<HistoryItem, "id">): HistoryItem {
    const result = getDb()
      .prepare(
        `INSERT INTO post_history
         (account_id, account_username, content, x_post_id, status, error_code, error_message, source, post_pool_id, posted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        item.accountId,
        item.accountUsername,
        item.content,
        item.xPostId,
        item.status,
        item.errorCode,
        item.errorMessage,
        item.source,
        item.postPoolId,
        item.postedAt,
      );
    return toHistoryItem(
      getDb().prepare("SELECT * FROM post_history WHERE id = ?").get(Number(result.lastInsertRowid)) as Row,
    );
  },
  /** ランダム投稿で「直前と同じ文章」を避けるため、そのアカウントで最後に試行したランダム投稿を返す */
  lastRandomForAccount(accountId: number): { postPoolId: number | null; content: string } | null {
    const r = getDb()
      .prepare(
        `SELECT post_pool_id, content FROM post_history
         WHERE account_id = ? AND source = 'random'
         ORDER BY posted_at DESC, id DESC LIMIT 1`,
      )
      .get(accountId) as Row | undefined;
    return r ? { postPoolId: numOrNull(r.post_pool_id), content: str(r.content) } : null;
  },
};

// ───────────────────────── settings ─────────────────────────

export const settingsRepo = {
  get<T>(key: string, fallback: T): T {
    const r = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as Row | undefined;
    if (!r) return fallback;
    try {
      return JSON.parse(str(r.value)) as T;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T): void {
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, JSON.stringify(value));
  },
};
