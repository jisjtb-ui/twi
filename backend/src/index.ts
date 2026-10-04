import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config, ROOT_DIR } from "./config.js";
import { closeDb, getDb } from "./database/db.js";
import { accountsRouter } from "./routes/accounts.js";
import { devRouter } from "./routes/dev.js";
import { errorHandler } from "./routes/util.js";

getDb();

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mock: config.x.mock });
});
app.use("/api/accounts", accountsRouter);
if (config.x.mock) app.use("/api/dev", devRouter);
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
  if (config.x.mock) console.log("[x-multi-poster] X_MOCK=true: X API を呼ばないモックモードで起動しています");
});

function shutdown(): void {
  server.close();
  closeDb();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
