import type { AccountSession } from "../session/SessionManager.js";

export type MacroResultCode =
  | "SUCCESS"
  | "LOGIN_REQUIRED"
  | "UI_NOT_FOUND"
  | "X_ERROR"
  | "TIMEOUT"
  | "MANUAL_ACTION_REQUIRED";

export interface MacroResult {
  accountId: string;
  code: MacroResultCode;
  message?: string;
}

export interface Macro<T> {
  run(session: AccountSession, input: T): Promise<MacroResult>;
}
