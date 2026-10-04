import type { PoolItem } from "../../database/repositories.js";

/** min〜max 分の範囲で、次回投稿までの遅延（ms）をランダムに決める（秒単位で揺らす） */
export function randomDelayMs(minMinutes: number, maxMinutes: number): number {
  const minSec = Math.round(minMinutes * 60);
  const maxSec = Math.round(maxMinutes * 60);
  const sec = minSec + Math.floor(Math.random() * (maxSec - minSec + 1));
  return sec * 1000;
}

/**
 * 有効な投稿候補からランダムに1件選ぶ。
 * 同じアカウントで直前に使った文章（lastContent）は選ばない。候補が無ければ null。
 */
export function pickPoolItem(enabled: PoolItem[], lastContent: string | null): PoolItem | null {
  const candidates = lastContent === null ? enabled : enabled.filter((p) => p.content !== lastContent);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
