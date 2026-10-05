import type { SessionManager } from "../session/SessionManager.js";
import type { Macro, MacroResult } from "./types.js";

export class MacroEngine {
  constructor(private sessions: SessionManager) {}

  execute<T>(macro: Macro<T>, accountIds: string[], input: T): Promise<MacroResult[]> {
    return Promise.all(
      [...new Set(accountIds)].map(async (accountId) => {
        try {
          return await macro.run(this.sessions.get(accountId), input);
        } catch (error) {
          return {
            accountId,
            code: "X_ERROR" as const,
            message: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );
  }
}
