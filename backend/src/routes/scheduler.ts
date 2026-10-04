import { Router } from "express";
import { accountsRepo, poolRepo, queueRepo } from "../database/repositories.js";
import { getSettings, pause, resume, start, stop } from "../services/scheduler/scheduler.js";
import { route } from "./util.js";

export const schedulerRouter = Router();

function snapshot() {
  const accounts = new Map(accountsRepo.list().map((a) => [a.id, a]));
  const pool = new Map(poolRepo.list().map((p) => [p.id, p]));
  return {
    settings: getSettings(),
    queue: queueRepo.listPending().map((q) => ({
      id: q.id,
      accountId: q.accountId,
      username: accounts.get(q.accountId)?.username ?? `#${q.accountId}`,
      scheduledAt: q.scheduledAt,
      content: q.postPoolId !== null ? (pool.get(q.postPoolId)?.content ?? null) : null,
    })),
  };
}

schedulerRouter.get(
  "/",
  route(() => snapshot()),
);

schedulerRouter.post(
  "/start",
  route((req) => {
    start({
      accountIds: Array.isArray(req.body?.accountIds) ? req.body.accountIds.map(Number) : [],
      minMinutes: Number(req.body?.minMinutes),
      maxMinutes: Number(req.body?.maxMinutes),
    });
    return snapshot();
  }),
);

schedulerRouter.post(
  "/pause",
  route(() => {
    pause();
    return snapshot();
  }),
);

schedulerRouter.post(
  "/resume",
  route(() => {
    resume();
    return snapshot();
  }),
);

schedulerRouter.post(
  "/stop",
  route(() => {
    stop();
    return snapshot();
  }),
);
