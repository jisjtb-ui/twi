import { Router } from "express";
import { accountsRepo, historyRepo } from "../database/repositories.js";
import { AppError } from "../errors.js";
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

export const historyRouter = Router();

historyRouter.get(
  "/",
  route((req) => historyRepo.list(Math.min(Number(req.query.limit ?? 100) || 100, 500))),
);
