import { randomUUID } from "node:crypto";
import { BrowserWindow, WebContentsView, session } from "electron";

export interface AccountSession {
  id: string;
  partition: string;
  view: WebContentsView;
}

export class SessionManager {
  private sessions = new Map<string, AccountSession>();
  private activeId: string | null = null;

  constructor(private win: BrowserWindow) {}

  async add(): Promise<AccountSession> {
    const id = randomUUID();
    const partition = `persist:x-account-${id}`;
    const browserSession = session.fromPartition(partition, { cache: true });
    const view = new WebContentsView({
      webPreferences: {
        session: browserSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });
    const account = { id, partition, view };
    this.sessions.set(id, account);
    await view.webContents.loadURL("https://x.com/i/flow/login");
    this.activate(id);
    return account;
  }

  get(id: string): AccountSession {
    const value = this.sessions.get(id);
    if (!value) throw new Error("AccountSession not found");
    return value;
  }

  list(): AccountSession[] {
    return [...this.sessions.values()];
  }

  activate(id: string): void {
    const target = this.get(id);
    for (const item of this.sessions.values()) {
      if (item.id !== id && this.win.contentView.children.includes(item.view)) {
        this.win.contentView.removeChildView(item.view);
      }
    }
    if (!this.win.contentView.children.includes(target.view)) {
      this.win.contentView.addChildView(target.view);
    }
    this.activeId = id;
    this.layout();
  }

  layout(): void {
    if (!this.activeId) return;
    const target = this.get(this.activeId);
    const [width, height] = this.win.getContentSize();
    target.view.setBounds({ x: 0, y: 120, width, height: Math.max(0, height - 120) });
  }
}
