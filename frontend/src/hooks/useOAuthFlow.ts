import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import type { Account } from "../api/types";

export type OAuthFlowState =
  | { phase: "idle" }
  | { phase: "waiting"; authorizeUrl: string; reauth: Account | null; popupBlocked: boolean }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

const POLL_MS = 1500;

/**
 * アカウント追加・再認証フロー。
 * X 公式の認可画面を新しいタブで開き、バックエンドの完了状態をポーリングする。
 * （X の画面ではタブ間通信ができないため、ポーリングで完了を検知する）
 */
export function useOAuthFlow(onCompleted: () => void) {
  const [state, setState] = useState<OAuthFlowState>({ phase: "idle" });
  const timer = useRef<number | null>(null);

  const stopPolling = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stopPolling, []);

  const start = useCallback(
    async (reauth: Account | null) => {
      stopPolling();
      // ポップアップブロック回避のため、クリック直後に空タブを開いてから URL を設定する
      const win = window.open("about:blank", "_blank");
      if (win) win.opener = null;
      try {
        const { state: oauthState, authorizeUrl } = await api.startOAuth(reauth?.id);
        if (win) win.location.href = authorizeUrl;
        setState({ phase: "waiting", authorizeUrl, reauth, popupBlocked: !win });
        timer.current = window.setInterval(async () => {
          try {
            const s = await api.oauthStatus(oauthState);
            if (s.status === "pending") return;
            stopPolling();
            if (s.status === "success") {
              setState({
                phase: "done",
                message: s.reauth ? `@${s.account.username} を再接続しました` : `@${s.account.username} を追加しました`,
              });
              onCompleted();
            } else {
              setState({ phase: "error", message: s.message });
            }
          } catch {
            // 一時的な失敗は次回ポーリングで再試行
          }
        }, POLL_MS);
      } catch (err) {
        win?.close();
        setState({ phase: "error", message: err instanceof ApiError ? err.message : String(err) });
      }
    },
    [onCompleted],
  );

  const cancel = useCallback(() => {
    stopPolling();
    setState({ phase: "idle" });
  }, []);

  return { state, start, cancel };
}
