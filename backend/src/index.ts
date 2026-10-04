import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config, ROOT_DIR } from "./config.js";
import { closeDb, getDb } from "./database/db.js";
import { accountsRouter } from "./routes/accounts.js";
import { oauthRouter } from "./routes/oauth.js";
import { poolRouter } from "./routes/pool.js";
import { historyRouter, postsRouter } from "./routes/posts.js";
import { schedulerRouter } from "./routes/scheduler.js";
import { errorHandler, localOnly } from "./routes/util.js";
import { initScheduler, shutdownScheduler } from "./services/scheduler/scheduler.js";
import { getSecretStore } from "./services/security/secretStore.js";
import { isXConfigured } from "./services/x/client.js";

getDb();
const secretStore = await getSecretStore();
initScheduler();

const app = express();
app.disable("x-powered-by");
app.use(localOnly);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  const store = await getSecretStore();
  res.json({ ok: true, mock: config.x.mock, xConfigured: isXConfigured(), secretStore: store.kind });
});
app.use("/api/accounts", accountsRouter);
app.use("/api/oauth", oauthRouter);
app.use("/api/posts", postsRouter);
app.use("/api/history", historyRouter);
app.use("/api/pool", poolRouter);
app.use("/api/scheduler", schedulerRouter);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "APIが見つかりません" } });
});
app.use(errorHandler);

// ビルド済みフロントエンドを配信（npm run build 後の本番起動用）
const webDist = path.join(ROOT_DIR, "frontend", "dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

const server = app.listen(config.port, config.host, () => {
  console.log(`[x-multi-poster] API: http://${config.host}:${config.port}`);
  console.log(`[x-multi-poster] トークン保存先: ${secretStore.kind === "keychain" ? "OS資格情報ストア" : "暗号化ファイル"}`);
  if (!isXConfigured()) console.warn("[x-multi-poster] X_CLIENT_ID が未設定です。README の初期設定を参照してください");
  if (config.x.mock) console.log("[x-multi-poster] X_MOCK=true: X API を呼ばないモックモードで起動しています");
});

process.on("unhandledRejection", (reason) => {
  console.error("[x-multi-poster] unhandledRejection", reason);
});

function shutdown(): void {
  shutdownScheduler();
  server.close();
  closeDb();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
