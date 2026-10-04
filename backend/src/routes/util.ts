import type { NextFunction, Request, Response } from "express";
import { AppError, toAppError } from "../errors.js";

type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;

/** async ハンドラの例外をエラーハンドラへ渡し、戻り値を JSON で返す */
export function route(handler: Handler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await handler(req, res);
      if (!res.headersSent) res.json(result ?? { ok: true });
    } catch (err) {
      next(err);
    }
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const appErr = toAppError(err);
  if (appErr.code === "INTERNAL") console.error("[api]", err);
  else if (appErr.httpStatus >= 500) console.warn(`[api] ${appErr.code}: ${appErr.message}`);
  res.status(appErr.httpStatus).json({ error: { code: appErr.code, message: appErr.message } });
}

export function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new AppError("BAD_REQUEST", "IDが不正です");
  return id;
}
