import { setTimeout as delay } from "node:timers/promises";
import type { AccountSession } from "../session/SessionManager.js";
import { X_SELECTORS } from "../x/selectors.js";
import type { Macro, MacroResult, MacroResultCode } from "./types.js";

export class PostMacro implements Macro<{ text: string }> {
  async run(account: AccountSession, input: { text: string }): Promise<MacroResult> {
    const wc = account.view.webContents;
    const text = input.text.trim();
    if (!text) return this.result(account.id, "X_ERROR", "投稿本文が空です");

    const state = this.restriction(wc.getURL());
    if (state) return this.result(account.id, state, "手動操作が必要です");

    await wc.loadURL("https://x.com/compose/post");

    if (this.restriction(wc.getURL()) === "LOGIN_REQUIRED") {
      return this.result(account.id, "LOGIN_REQUIRED", "Xへログインしてください");
    }

    const found = await this.waitFor(wc, X_SELECTORS.POST_TEXTBOX, 15000);
    if (!found) {
      const code = this.restriction(wc.getURL()) ?? "UI_NOT_FOUND";
      return this.result(account.id, code, "投稿入力欄を検出できません");
    }

    const inserted = await wc.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(X_SELECTORS.POST_TEXTBOX)});
      if (!(el instanceof HTMLElement)) return false;
      el.focus();
      document.execCommand("insertText", false, ${JSON.stringify(text)});
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return true;
    })()`, true);

    if (!inserted) return this.result(account.id, "UI_NOT_FOUND", "本文を入力できません");

    const enabled = await this.waitForEnabledButton(wc, 15000);
    if (!enabled) return this.result(account.id, "UI_NOT_FOUND", "投稿ボタンが有効になりません");

    const clicked = await wc.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(X_SELECTORS.POST_BUTTON)});
      if (!(el instanceof HTMLElement) || el.getAttribute("aria-disabled") === "true") return false;
      el.click();
      return true;
    })()`, true);

    if (!clicked) return this.result(account.id, "UI_NOT_FOUND", "投稿ボタンを押せません");

    const closed = await this.waitUntilMissing(wc, X_SELECTORS.POST_TEXTBOX, 20000);
    if (!closed) {
      return this.result(account.id, "TIMEOUT", "投稿完了を確認できません。自動再試行はしません");
    }
    return this.result(account.id, "SUCCESS");
  }

  private restriction(url: string): MacroResultCode | null {
    if (/\/i\/flow\/login|\/login(?:\?|$)/.test(url)) return "LOGIN_REQUIRED";
    if (/\/account\/access|\/i\/flow\/challenge|\/i\/flow\/verify/.test(url)) {
      return "MANUAL_ACTION_REQUIRED";
    }
    return null;
  }

  private async waitFor(wc: AccountSession["view"]["webContents"], selector: string, timeout: number): Promise<boolean> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        if (await wc.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, true)) return true;
      } catch {}
      await delay(250);
    }
    return false;
  }

  private async waitForEnabledButton(wc: AccountSession["view"]["webContents"], timeout: number): Promise<boolean> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        if (await wc.executeJavaScript(`(() => {
          const el = document.querySelector(${JSON.stringify(X_SELECTORS.POST_BUTTON)});
          return Boolean(el && el.getAttribute("aria-disabled") !== "true");
        })()`, true)) return true;
      } catch {}
      await delay(250);
    }
    return false;
  }

  private async waitUntilMissing(wc: AccountSession["view"]["webContents"], selector: string, timeout: number): Promise<boolean> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      try {
        if (!(await wc.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, true))) return true;
      } catch {}
      await delay(300);
    }
    return false;
  }

  private result(accountId: string, code: MacroResultCode, message?: string): MacroResult {
    return { accountId, code, message };
  }
}
