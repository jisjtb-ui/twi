import { accountsRepo } from "../database/repositories.js";
import { AppError } from "../errors.js";
import { postToAccount, type PostResult } from "./posting.js";

/**
 * 選択した複数アカウントへの一括投稿。
 * - アカウントごとに独立して実行（1件失敗しても他は継続）
 * - 同じ requestId の再送は前回の結果を返す（ボタン連打・通信リトライによる二重投稿防止）
 * - 一括投稿の同時実行は1つまで
 */

const REQUEST_TTL_MS = 30 * 60 * 1000;
const requests = new Map<string, { at: number; promise: Promise<PostResult[]> }>();
let running: string | null = null;

export async function bulkPost(requestId: string, text: string, accountIds: number[]): Promise<PostResult[]> {
  const now = Date.now();
  for (const [id, r] of requests) if (now - r.at > REQUEST_TTL_MS) requests.delete(id);

  const existing = requests.get(requestId);
  if (existing) return existing.promise;

  if (running) {
    throw new AppError("DUPLICATE_REQUEST", "前回の一括投稿を処理中です。完了するまでお待ちください", 409);
  }

  const ids = [...new Set(accountIds)];
  if (ids.length === 0) throw new AppError("BAD_REQUEST", "投稿先のアカウントを選択してください");
  for (const id of ids) {
    if (!accountsRepo.get(id)) throw new AppError("NOT_FOUND", `アカウント #${id} が見つかりません`, 404);
  }

  running = requestId;
  const promise = Promise.all(ids.map((id) => postToAccount(id, text, "bulk"))).finally(() => {
    running = null;
  });
  requests.set(requestId, { at: now, promise });
  return promise;
}
