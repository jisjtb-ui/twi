import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import type { SessionManager } from "../session/SessionManager.js";
import type { MacroEngine } from "../macro/MacroEngine.js";
import type { PostMacro } from "../macro/PostMacro.js";

export class RemoteServer {
  readonly token = randomBytes(24).toString("hex");
  private server = createServer((req, res) => void this.handle(req, res));

  constructor(
    private sessions: SessionManager,
    private engine: MacroEngine,
    private postMacro: PostMacro
  ) {}

  listen(port = 8788): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(port, "0.0.0.0", () => {
        const address = this.server.address();
        resolve(typeof address === "object" && address ? address.port : port);
      });
    });
  }

  close(): void {
    this.server.close();
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");

    const url = new URL(req.url ?? "/", "http://local");
    if (url.pathname === "/") {
      this.html(res, MOBILE_HTML);
      return;
    }

    if (url.pathname === "/api/pair" && req.method === "POST") {
      const body = await this.jsonBody(req);
      if (body?.token !== this.token) return this.json(res, 401, { error: "PAIRING_FAILED" });
      return this.json(res, 200, { ok: true, token: this.token });
    }

    const auth = req.headers.authorization;
    if (auth !== `Bearer ${this.token}`) return this.json(res, 401, { error: "UNAUTHORIZED" });

    if (url.pathname === "/api/accounts" && req.method === "GET") {
      return this.json(res, 200, this.sessions.list().map((item) => ({
        id: item.id,
        url: item.view.webContents.getURL()
      })));
    }

    if (url.pathname === "/api/post" && req.method === "POST") {
      const body = await this.jsonBody(req);
      const ids = Array.isArray(body?.accountIds) ? body.accountIds.filter((x): x is string => typeof x === "string") : [];
      const text = typeof body?.text === "string" ? body.text : "";
      if (!ids.length || !text.trim()) return this.json(res, 400, { error: "INVALID_INPUT" });
      const results = await this.engine.execute(this.postMacro, ids, { text });
      return this.json(res, 200, { results });
    }

    this.json(res, 404, { error: "NOT_FOUND" });
  }

  private jsonBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => {
        data += String(chunk);
        if (data.length > 64_000) req.destroy();
      });
      req.on("end", () => {
        try { resolve(data ? JSON.parse(data) : {}); }
        catch { reject(new Error("Invalid JSON")); }
      });
      req.on("error", reject);
    });
  }

  private json(res: ServerResponse, status: number, value: unknown): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(value));
  }

  private html(res: ServerResponse, value: string): void {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(value);
  }
}

const MOBILE_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>X Multi Browser Remote</title><style>
*{box-sizing:border-box}body{margin:0;padding:18px;background:#0b0d10;color:#f3f5f7;font:16px system-ui,-apple-system,sans-serif}
main{max-width:640px;margin:auto}h1{font-size:21px}section{margin:18px 0}.card{padding:14px;border:1px solid #30363d;border-radius:12px;background:#11151a}
input,textarea,button{font:inherit}input[type=password],textarea{width:100%;background:#080a0d;color:#fff;border:1px solid #39414b;border-radius:10px;padding:12px;font-size:16px}
textarea{min-height:120px;resize:vertical}button{min-height:46px;border:1px solid #39414b;border-radius:10px;background:#20262e;color:#fff;padding:10px 14px}
.primary{width:100%;background:#1d9bf0;border-color:#1d9bf0;font-weight:700}.account{display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #252a31}.account:last-child{border:0}
.status{font-size:13px;color:#9da7b3;word-break:break-all}.result{padding:8px 0}.ok{color:#54c77a}.err{color:#ff7b72}
</style></head><body><main><h1>X Multi Browser Remote</h1>
<section id="pair" class="card"><label>PCに表示されたペアリングキー</label><input id="token" type="password" autocomplete="off"><p><button id="pairBtn" class="primary">接続</button></p></section>
<section id="app" hidden><div class="card"><strong>投稿するアカウント</strong><div id="accounts"></div></div>
<section><textarea id="text" placeholder="投稿内容"></textarea></section><button id="post" class="primary">選択アカウントへ投稿</button>
<section id="results" class="card" hidden></section></section></main>
<script>
let token="";const selected=new Set();
async function call(path,options={}){const r=await fetch(path,{...options,headers:{...(options.headers||{}),"Authorization":"Bearer "+token,"Content-Type":"application/json"}});if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}
async function accounts(){const list=await call("/api/accounts");const box=document.getElementById("accounts");box.innerHTML="";for(const a of list){const row=document.createElement("label");row.className="account";const c=document.createElement("input");c.type="checkbox";c.checked=selected.has(a.id);c.addEventListener("change",()=>c.checked?selected.add(a.id):selected.delete(a.id));const info=document.createElement("div");info.innerHTML="<div>"+a.id.slice(0,8)+"</div><div class=status>"+a.url+"</div>";row.append(c,info);box.append(row)}}
document.getElementById("pairBtn").addEventListener("click",async()=>{token=document.getElementById("token").value.trim();try{await call("/api/accounts");document.getElementById("pair").hidden=true;document.getElementById("app").hidden=false;await accounts()}catch{alert("ペアリングキーが違います")}});
document.getElementById("post").addEventListener("click",async()=>{const text=document.getElementById("text").value.trim();if(!text||!selected.size)return;const box=document.getElementById("results");box.hidden=false;box.textContent="実行中…";try{const data=await call("/api/post",{method:"POST",body:JSON.stringify({accountIds:[...selected],text})});box.innerHTML=data.results.map(r=>"<div class='result "+(r.code==="SUCCESS"?"ok":"err")+"'>"+r.accountId.slice(0,8)+" — "+r.code+"</div>").join("")}catch{box.textContent="通信に失敗しました"}});
</script></body></html>`;
