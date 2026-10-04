import type { HistoryItem } from "../api/types";
import { formatTime } from "../format";

export function History({ items }: { items: HistoryItem[] }) {
  return (
    <section className="panel area-history">
      <h2>
        <span>投稿履歴</span>
        <span className="small">直近{items.length}件</span>
      </h2>
      {items.length === 0 ? (
        <p className="muted small">履歴はありません</p>
      ) : (
        <ul className="list history-list">
          {items.map((h) => (
            <li key={h.id} className="history-item">
              <div className="row">
                <span className="mono">{formatTime(h.postedAt)}</span>
                <span>@{h.accountUsername}</span>
                <span className="tag">{h.source === "bulk" ? "一括" : "ランダム"}</span>
                <span className="spacer" />
                {h.status === "success" ? (
                  <span className="ok small">✓ 成功</span>
                ) : (
                  <span className="err small">✕ {h.errorMessage ?? "失敗"}</span>
                )}
              </div>
              <div className="history-content">
                「{h.content}」
                {h.xPostId && (
                  <span className="muted small"> ID: {h.xPostId}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
