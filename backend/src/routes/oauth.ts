import { Router } from "express";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { getOAuthStatus, handleCallback, startOAuth } from "../services/x/oauth.js";
import { route } from "./util.js";

export const oauthRouter = Router();

/** 「アカウント追加」「再認証」：X 公式の認可 URL を返す */
oauthRouter.post(
  "/start",
  route((req) => {
    const raw = req.body?.reauthAccountId;
    const reauthAccountId = raw === undefined || raw === null ? null : Number(raw);
    if (reauthAccountId !== null && !Number.isInteger(reauthAccountId)) {
      throw new AppError("BAD_REQUEST", "reauthAccountId が不正です");
    }
    return startOAuth(reauthAccountId);
  }),
);

oauthRouter.get(
  "/status",
  route((req) => getOAuthStatus(String(req.query.state ?? ""))),
);

/** X からのリダイレクト先（X Developer Portal に登録する Callback URL） */
oauthRouter.get("/callback", async (req, res) => {
  const result = await handleCallback(req.query as Record<string, unknown>);
  res.status(result.ok ? 200 : 400).type("html").send(resultPage(result.ok, result.message));
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function resultPage(ok: boolean, message: string): string {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>X Multi Poster</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0c;color:#e6e6e8;
font-family:system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
.box{max-width:420px;padding:24px;border:1px solid #2a2a2e;border-radius:8px;background:#141416;text-align:center}
h1{font-size:18px;margin:0 0 12px;color:${ok ? "#4ade80" : "#f87171"}}
p{line-height:1.6;color:#c8c8cc}a{color:#e6e6e8}
</style></head><body><div class="box">
<h1>${ok ? "✓ 接続完了" : "✕ 接続できませんでした"}</h1>
<p>${escapeHtml(message)}</p>
<p>このタブを閉じて、アプリに戻ってください。</p>
<p><a href="${escapeHtml(config.appUrl)}">アプリを開く</a></p>
</div>
<script>setTimeout(function(){try{window.close()}catch(e){}},${ok ? 1200 : 60000});</script>
</body></html>`;
}
