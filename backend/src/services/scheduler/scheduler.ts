import { accountsRepo, historyRepo, poolRepo, queueRepo, settingsRepo } from "../../database/repositories.js";
import { AppError } from "../../errors.js";
import { postToAccount } from "../posting.js";
import { pickPoolItem, randomDelayMs } from "./random.js";

/**
 * ランダム投稿スケジューラー。
 * - アカウントごとに独立したキュー（queue テーブルに pending 行を1つずつ）を持つ
 * - 投稿後、そのアカウントの次回時刻を [min, max] 分の範囲で再びランダムに決める
 * - 状態・設定・キューは SQLite に保存し、再起動後に復元する
 * - 安全のため、再起動時に「実行中」だった場合は自動再開せず「一時停止」で復元する
 */

export type SchedulerState = "stopped" | "running" | "paused";

export interface RandomSettings {
  state: SchedulerState;
  accountIds: number[];
  minMinutes: number;
  maxMinutes: number;
  /** 一時停止・停止の理由（自動で止めた場合に表示） */
  notice: string | null;
}

const SETTINGS_KEY = "random";
const TICK_MS = 5_000;
const MIN_MINUTES = 1;
const MAX_MINUTES = 7 * 24 * 60;

const DEFAULT_SETTINGS: RandomSettings = {
  state: "stopped",
  accountIds: [],
  minMinutes: 30,
  maxMinutes: 120,
  notice: null,
};

export function getSettings(): RandomSettings {
  return { ...DEFAULT_SETTINGS, ...settingsRepo.get<Partial<RandomSettings>>(SETTINGS_KEY, {}) };
}

function saveSettings(patch: Partial<RandomSettings>): RandomSettings {
  const next = { ...getSettings(), ...patch };
  settingsRepo.set(SETTINGS_KEY, next);
  return next;
}

// ───────────────── キュー操作 ─────────────────

/** アカウントの次回投稿をキューに入れる。投稿候補が無ければ null */
function scheduleNext(accountId: number, settings: RandomSettings, notBefore = 0): boolean {
  const item = pickPoolItem(poolRepo.listEnabled(), historyRepo.lastContentForAccount(accountId));
  if (!item) return false;
  const at = Math.max(Date.now() + randomDelayMs(settings.minMinutes, settings.maxMinutes), notBefore);
  queueRepo.add(accountId, item.id, new Date(at).toISOString());
  return true;
}

function validateRange(minMinutes: number, maxMinutes: number): void {
  if (!Number.isFinite(minMinutes) || !Number.isFinite(maxMinutes)) {
    throw new AppError("BAD_REQUEST", "投稿間隔を数値で入力してください");
  }
  if (minMinutes < MIN_MINUTES) throw new AppError("BAD_REQUEST", `最短は${MIN_MINUTES}分以上にしてください`);
  if (maxMinutes > MAX_MINUTES) throw new AppError("BAD_REQUEST", "最長は7日（10080分）以内にしてください");
  if (minMinutes > maxMinutes) throw new AppError("BAD_REQUEST", "最短は最長以下にしてください");
}

// ───────────────── 操作 ─────────────────

export function start(input: { accountIds: number[]; minMinutes: number; maxMinutes: number }): RandomSettings {
  validateRange(input.minMinutes, input.maxMinutes);
  const ids = [...new Set(input.accountIds)];
  if (ids.length === 0) throw new AppError("BAD_REQUEST", "ランダム投稿の対象アカウントを選択してください");
  const accounts = ids.map((id) => accountsRepo.get(id));
  if (accounts.some((a) => !a)) throw new AppError("NOT_FOUND", "選択したアカウントが見つかりません", 404);
  const needReauth = accounts.filter((a) => a!.status !== "connected");
  if (needReauth.length > 0) {
    throw new AppError(
      "AUTH_EXPIRED",
      `再認証が必要なアカウントがあります：${needReauth.map((a) => `@${a!.username}`).join(", ")}`,
      400,
    );
  }
  if (poolRepo.listEnabled().length < 2) {
    throw new AppError("BAD_REQUEST", "ランダム投稿には、ONの投稿候補が2件以上必要です（同じ文章の連続投稿を防ぐため）");
  }

  queueRepo.cancelAllPending();
  const settings = saveSettings({
    state: "running",
    accountIds: ids,
    minMinutes: input.minMinutes,
    maxMinutes: input.maxMinutes,
    notice: null,
  });
  for (const id of ids) scheduleNext(id, settings);
  console.log(`[scheduler] 開始: ${ids.length}アカウント ${settings.minMinutes}〜${settings.maxMinutes}分`);
  return settings;
}

export function pause(notice: string | null = null): RandomSettings {
  const s = getSettings();
  if (s.state !== "running") throw new AppError("BAD_REQUEST", "ランダム投稿は実行中ではありません");
  console.log(`[scheduler] 一時停止${notice ? `: ${notice}` : ""}`);
  return saveSettings({ state: "paused", notice });
}

export function resume(): RandomSettings {
  const s = getSettings();
  if (s.state !== "paused") throw new AppError("BAD_REQUEST", "ランダム投稿は一時停止中ではありません");
  if (poolRepo.listEnabled().length < 2) {
    throw new AppError("BAD_REQUEST", "ランダム投稿には、ONの投稿候補が2件以上必要です");
  }
  const settings = saveSettings({ state: "running", notice: null });
  // 一時停止中に予定時刻を過ぎたものは、まとめて投稿しないよう新しいランダム時刻に振り直す
  const now = Date.now();
  for (const q of queueRepo.listPending()) {
    if (new Date(q.scheduledAt).getTime() <= now) {
      const at = now + randomDelayMs(settings.minMinutes, settings.maxMinutes);
      queueRepo.reschedule(q.id, new Date(at).toISOString(), q.postPoolId);
    }
  }
  // キューが無くなっているアカウントを補充
  for (const id of settings.accountIds) {
    if (accountsRepo.get(id) && !queueRepo.pendingForAccount(id)) scheduleNext(id, settings);
  }
  console.log("[scheduler] 再開");
  return settings;
}

export function stop(notice: string | null = null): RandomSettings {
  queueRepo.cancelAllPending();
  console.log(`[scheduler] 停止${notice ? `: ${notice}` : ""}`);
  return saveSettings({ state: "stopped", notice });
}

/** アカウント削除時に対象から外す（queue は外部キーで削除される） */
export function onAccountDeleted(accountId: number): void {
  const s = getSettings();
  if (!s.accountIds.includes(accountId)) return;
  const accountIds = s.accountIds.filter((id) => id !== accountId);
  saveSettings({ accountIds });
  if (accountIds.length === 0 && s.state !== "stopped") stop("対象アカウントが無くなったため停止しました");
}

// ───────────────── 実行ループ ─────────────────

const executing = new Set<number>();

const POOL_SHORTAGE =
  "ONの投稿候補が足りないため一時停止しました。投稿プールに文章を追加してから「再開」してください";

function pauseIfRunning(notice: string): void {
  if (getSettings().state === "running") pause(notice);
}

async function execute(queueId: number, accountId: number, postPoolId: number | null): Promise<void> {
  // 予約時の文章が削除・OFF・直前と同じになっていたら選び直す
  const enabled = poolRepo.listEnabled();
  const last = historyRepo.lastContentForAccount(accountId);
  let item = enabled.find((p) => p.id === postPoolId && p.content !== last) ?? null;
  item ??= pickPoolItem(enabled, last);
  if (!item) {
    queueRepo.finish(queueId, "cancelled");
    pauseIfRunning(POOL_SHORTAGE);
    return;
  }

  const result = await postToAccount(accountId, item.content, "random", item.id);
  queueRepo.finish(queueId, result.ok ? "done" : "failed");

  if (result.errorCode === "PAYMENT_REQUIRED") {
    pauseIfRunning(`${result.errorMessage}（ランダム投稿を一時停止しました）`);
    return;
  }

  // 停止・一時停止された、または対象から外れた場合は次を予約しない
  const settings = getSettings();
  if (settings.state === "stopped" || !settings.accountIds.includes(accountId) || !accountsRepo.get(accountId)) return;
  if (queueRepo.pendingForAccount(accountId)) return;
  // レート制限時は解除時刻より前に再試行しない（制限の回避はしない）
  const notBefore = result.rateLimitResetAt ? result.rateLimitResetAt * 1000 + 60_000 : 0;
  if (!scheduleNext(accountId, settings, notBefore)) pauseIfRunning(POOL_SHORTAGE);
}

function tick(): void {
  if (getSettings().state !== "running") return;
  for (const q of queueRepo.due(new Date().toISOString())) {
    if (executing.has(q.id)) continue;
    if (!queueRepo.claim(q.id)) continue; // pending → processing（原子的）
    executing.add(q.id);
    void execute(q.id, q.accountId, q.postPoolId)
      .catch((err) => {
        console.error("[scheduler] 実行エラー", err);
        queueRepo.finish(q.id, "failed");
      })
      .finally(() => executing.delete(q.id));
  }
}

let timer: NodeJS.Timeout | null = null;

/** 起動時の復元。実行中だった場合も自動では再開しない（意図しない投稿を防ぐ） */
export function initScheduler(): void {
  const recovered = queueRepo.recoverProcessing();
  if (recovered > 0) console.warn(`[scheduler] 処理中のまま終了していた予約 ${recovered} 件を失敗扱いにしました`);
  const s = getSettings();
  if (s.state === "running") {
    saveSettings({
      state: "paused",
      notice: "アプリ再起動のため一時停止しています。「再開」を押すと続きから再開します",
    });
    console.log("[scheduler] 前回実行中だったため、一時停止状態で復元しました");
  }
  timer = setInterval(tick, TICK_MS);
}

export function shutdownScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
