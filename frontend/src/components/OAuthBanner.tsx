import type { OAuthFlowState } from "../hooks/useOAuthFlow";

export function OAuthBanner({ state, onClose }: { state: OAuthFlowState; onClose: () => void }) {
  if (state.phase === "idle") return null;

  if (state.phase === "waiting") {
    return (
      <div className="notice">
        <div className="row">
          <strong>
            {state.reauth ? `@${state.reauth.username} を再認証中…` : "Xアカウントを追加中…"}
          </strong>
          <span className="spacer" />
          <button className="link" onClick={onClose}>
            キャンセル
          </button>
        </div>
        <p className="small" style={{ margin: "6px 0 0" }}>
          開いたタブで X にログインし、「アプリにアクセスを許可」を押してください。完了すると自動で反映されます。
        </p>
        {state.popupBlocked && (
          <p className="small warn" style={{ margin: "6px 0 0" }}>
            タブが開きませんでした。
            <a href={state.authorizeUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
              こちらをクリックして X の認可画面を開いてください
            </a>
          </p>
        )}
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          {state.reauth
            ? `X で @${state.reauth.username} にログインした状態で認可してください。`
            : "2つ目以降のアカウントを追加する場合は、X 上で追加したいアカウントに切り替えてから認可してください（X はブラウザでログイン中のアカウントを使います）。"}
        </p>
      </div>
    );
  }

  return (
    <div className={`notice ${state.phase === "error" ? "err" : ""}`}>
      <div className="row">
        <span className={state.phase === "error" ? "err" : "ok"}>
          {state.phase === "error" ? "✕ " : "✓ "}
          {state.message}
        </span>
        <span className="spacer" />
        <button className="link" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
