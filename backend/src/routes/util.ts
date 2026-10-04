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

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hostnameOf(hostHeader: string): string {
  return hostHeader.replace(/:\d+$/, "").toLowerCase();
}

/**
 * ローカル専用アプリのため、自分自身（127.0.0.1 / localhost）以外からの API 呼び出しを拒否する。
 * - Host ヘッダ検証：DNS リバインディング対策
 * - Origin ヘッダ検証：他サイトのページから投稿 API を叩かれるのを防ぐ
 * （OAuth コールバックは X からのリダイレクトだが、ブラウザのトップレベル遷移なので Origin は付かない）
 */
export function localOnly(req: Request, res: Response, next: NextFunction): void {
  const host = hostnameOf(req.headers.host ?? "");
  let originOk = true;
  const origin = req.headers.origin;
  if (origin && origin !== "null") {
    try {
      originOk = LOCAL_HOSTS.has(new URL(origin).hostname.toLowerCase());
    } catch {
      originOk = false;
    }
  }
  if (!LOCAL_HOSTS.has(host) || !originOk) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "このアプリはローカルからのみ利用できます" } });
    return;
  }
  next();
}
