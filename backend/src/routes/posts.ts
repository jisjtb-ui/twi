import { Router } from "express";
import { accountsRepo, historyRepo } from "../database/repositories.js";
import { AppError } from "../errors.js";
import { bulkPost } from "../services/bulkPost.js";
import { postToAccount, validatePostText } from "../services/posting.js";
import { route } from "./util.js";

export const postsRouter = Router();

/** 1アカウントへ投稿 */
postsRouter.post(
  "/single",
  route(async (req) => {
    const text = validatePostText(req.body?.text);
    const accountId = Number(req.body?.accountId);
    if (!accountsRepo.get(accountId)) throw new AppError("NOT_FOUND", "アカウントが見つかりません", 404);
    return postToAccount(accountId, text, "bulk");
  }),
);

/** 選択した複数アカウントへ一括投稿 */
postsRouter.post(
  "/bulk",
  route(async (req) => {
    const text = validatePostText(req.body?.text);
    const requestId = String(req.body?.requestId ?? "");
    if (!/^[\w-]{8,100}$/.test(requestId)) throw new AppError("BAD_REQUEST", "requestId が不正です");
    const accountIds = Array.isArray(req.body?.accountIds) ? req.body.accountIds.map(Number) : [];
    if (accountIds.some((id: number) => !Number.isInteger(id))) throw new AppError("BAD_REQUEST", "accountIds が不正です");
    return { results: await bulkPost(requestId, text, accountIds) };
  }),
);

export const historyRouter = Router();

historyRouter.get(
  "/",
  route((req) => historyRepo.list(Math.min(Number(req.query.limit ?? 100) || 100, 500))),
);
