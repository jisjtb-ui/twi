import { Router } from "express";
import { accountsRepo } from "../database/repositories.js";
import { route } from "./util.js";

/** Phase 1: X_MOCK=true のときだけ有効なダミーアカウント追加 */
export const devRouter = Router();

devRouter.post(
  "/mock-account",
  route(() => {
    const n = accountsRepo.list().length + 1;
    const name = `dummy_${String.fromCharCode(96 + ((n - 1) % 26) + 1)}${n > 26 ? n : ""}`;
    return accountsRepo.upsert({
      xUserId: `mock-${Date.now()}-${n}`,
      username: name,
      displayName: `ダミー ${n}`,
      avatarUrl: null,
      isMock: true,
    });
  }),
);
