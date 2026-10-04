import { Router } from "express";
import { poolRepo } from "../database/repositories.js";
import { transaction } from "../database/db.js";
import { AppError } from "../errors.js";
import { idParam, route } from "./util.js";

export const poolRouter = Router();

const MAX_BULK_LINES = 1000;

function content(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) throw new AppError("BAD_REQUEST", "文章を入力してください");
  return raw.trim();
}

poolRouter.get(
  "/",
  route(() => poolRepo.list()),
);

poolRouter.post(
  "/",
  route((req) => poolRepo.add(content(req.body?.content))),
);

/** 1行＝1投稿として一括登録（空行は無視） */
poolRouter.post(
  "/bulk",
  route((req) => {
    if (typeof req.body?.text !== "string") throw new AppError("BAD_REQUEST", "文章を入力してください");
    const lines = req.body.text
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);
    if (lines.length === 0) throw new AppError("BAD_REQUEST", "登録する行がありません");
    if (lines.length > MAX_BULK_LINES) throw new AppError("BAD_REQUEST", `一度に登録できるのは${MAX_BULK_LINES}行までです`);
    const added = transaction(() => lines.map((l: string) => poolRepo.add(l)));
    return { added: added.length };
  }),
);

poolRouter.patch(
  "/:id",
  route((req) => {
    const id = idParam(req);
    const patch: { content?: string; enabled?: boolean } = {};
    if (req.body?.content !== undefined) patch.content = content(req.body.content);
    if (typeof req.body?.enabled === "boolean") patch.enabled = req.body.enabled;
    const updated = poolRepo.update(id, patch);
    if (!updated) throw new AppError("NOT_FOUND", "投稿候補が見つかりません", 404);
    return updated;
  }),
);

poolRouter.delete(
  "/:id",
  route((req) => {
    poolRepo.delete(idParam(req));
    return { ok: true };
  }),
);
