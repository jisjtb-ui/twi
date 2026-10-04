import { Router } from "express";
import { accountsRepo } from "../database/repositories.js";
import { AppError } from "../errors.js";
import { forgetAccountTokens } from "../services/x/accountAuth.js";
import { idParam, route } from "./util.js";

export const accountsRouter = Router();

accountsRouter.get(
  "/",
  route(() => accountsRepo.list()),
);

accountsRouter.patch(
  "/:id",
  route((req) => {
    const id = idParam(req);
    if (!accountsRepo.get(id)) throw new AppError("NOT_FOUND", "アカウントが見つかりません", 404);
    if (typeof req.body?.selected === "boolean") accountsRepo.setSelected(id, req.body.selected);
    return accountsRepo.get(id);
  }),
);

accountsRouter.post(
  "/select-all",
  route((req) => {
    accountsRepo.setAllSelected(req.body?.selected !== false);
    return accountsRepo.list();
  }),
);

accountsRouter.delete(
  "/:id",
  route(async (req) => {
    const id = idParam(req);
    const account = accountsRepo.get(id);
    if (!account) throw new AppError("NOT_FOUND", "アカウントが見つかりません", 404);
    await forgetAccountTokens(account);
    accountsRepo.delete(id);
    return { ok: true };
  }),
);
