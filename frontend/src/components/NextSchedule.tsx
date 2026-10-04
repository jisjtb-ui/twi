import type { SchedulerSnapshot } from "../api/types";
import { formatTime } from "../format";

export function NextSchedule({ scheduler }: { scheduler: SchedulerSnapshot | null }) {
  const state = scheduler?.settings.state ?? "stopped";
  const queue = scheduler?.queue ?? [];
  return (
    <section className="panel area-next">
      <h2>
        <span>次回投稿</span>
        {state === "paused" && queue.length > 0 && <span className="small warn">一時停止中（再開するまで投稿しません）</span>}
      </h2>
      {queue.length === 0 ? (
        <p className="muted small">予定はありません</p>
      ) : (
        <ul className="list">
          {queue.map((q) => (
            <li key={q.id} className="row" style={{ flexWrap: "nowrap" }}>
              <span className="mono">{formatTime(q.scheduledAt)}</span>
              <span>@{q.username}</span>
              {q.content && <span className="muted small ellipsis">「{q.content}」</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
