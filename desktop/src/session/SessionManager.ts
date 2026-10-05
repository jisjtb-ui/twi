import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app, BrowserWindow, WebContentsView, session } from "electron";

interface StoredAccount { id: string; partition: string; }
export interface AccountSession extends StoredAccount { view: WebContentsView; }

export class SessionManager {
  private sessions = new Map<string, AccountSession>();
  private activeId: string | null = null;
  private storePath = path.join(app.getPath("userData"), "accounts.json");

  constructor(private win: BrowserWindow) {}

  async restore(): Promise<void> {
    let saved: StoredAccount[] = [];
    try { saved = JSON.parse(fs.readFileSync(this.storePath, "utf8")); } catch {}
    for (const item of saved) this.create(item);
    const first = this.sessions.values().next().value as AccountSession | undefined;
    if (first) {
      this.activate(first.id);
      if (!first.view.webContents.getURL()) await first.view.webContents.loadURL("https://x.com/home");
    }
  }

  async add(): Promise<AccountSession> {
    const id = randomUUID();
    const account = this.create({ id, partition: `persist:x-account-${id}` });
    this.save();
    await account.view.webContents.loadURL("https://x.com/i/flow/login");
    this.activate(id);
    return account;
  }

  get(id: string): AccountSession {
    const value = this.sessions.get(id);
    if (!value) throw new Error("AccountSession not found");
    return value;
  }

  list(): AccountSession[] { return [...this.sessions.values()]; }

  activate(id: string): void {
    const target = this.get(id);
    for (const item of this.sessions.values()) {
      if (item.id !== id && this.win.contentView.children.includes(item.view)) this.win.contentView.removeChildView(item.view);
    }
    if (!this.win.contentView.children.includes(target.view)) this.win.contentView.addChildView(target.view);
    this.activeId = id;
    this.layout();
    target.view.webContents.focus();
  }

  layout(): void {
    if (!this.activeId) return;
    const target = this.get(this.activeId);
    const [width, height] = this.win.getContentSize();
    target.view.setBounds({ x: 0, y: 120, width, height: Math.max(0, height - 120) });
  }

  private create(stored: StoredAccount): AccountSession {
    const browserSession = session.fromPartition(stored.partition, { cache: true });
    const view = new WebContentsView({ webPreferences: {
      session: browserSession, nodeIntegration: false, contextIsolation: true, sandbox: true
    }});
    const account = { ...stored, view };
    this.sessions.set(stored.id, account);
    if (!view.webContents.getURL()) void view.webContents.loadURL("https://x.com/home");
    return account;
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.list().map(({ id, partition }) => ({ id, partition })), null, 2));
  }
}
