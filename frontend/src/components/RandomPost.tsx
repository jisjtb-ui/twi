import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { Account, PoolItem, SchedulerSnapshot } from "../api/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { PoolManager } from "./PoolManager";

interface Props {
  accounts: Account[];
  pool: PoolItem[];
  scheduler: SchedulerSnapshot | null;
  onPoolChanged: () => void;
  onSchedulerChanged: (s: SchedulerSnapshot) => void;
}

const STATE_LABEL = {
  stopped: { text: "停止中", cls: "muted" },
  running: { text: "● 実行中", cls: "ok" },
  paused: { text: "一時停止中", cls: "warn" },
} as const;

export function RandomPost({ accounts, pool, scheduler, onPoolChanged, onSchedulerChanged }: Props) {
  const settings = scheduler?.settings;
  const state = settings?.state ?? "stopped";
  const editable = state === "stopped";

  const [targetIds, setTargetIds] = useState<number[]>([]);
  const [minMinutes, setMinMinutes] = useState("30");
  const [maxMinutes, setMaxMinutes] = useState("120");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // 保存済み設定をフォームへ反映（初回と、停止以外の状態のとき）
  useEffect(() => {
    if (!settings) return;
    // 対象の既定値（左の選択）を決めるため、アカウント一覧の読み込みを待つ
    if (!initialized && settings.accountIds.length === 0 && accounts.length === 0) return;
    if (!initialized || !editable) {
      setTargetIds(
        settings.accountIds.length > 0 ? settings.accountIds : accounts.filter((a) => a.selected).map((a) => a.id),
      );
      setMinMinutes(String(settings.minMinutes));
      setMaxMinutes(String(settings.maxMinutes));
      setInitialized(true);
    }
    // accounts は初回の既定値にのみ使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, initialized, editable]);

  const enabledCount = pool.filter((p) => p.enabled).length;
  const validTargets = targetIds.filter((id) => accounts.some((a) => a.id === id));
  const targetAccounts = accounts.filter((a) => validTargets.includes(a.id));

  const run = async (fn: () => Promise<SchedulerSnapshot>) => {
    setBusy(true);
    setError(null);
    try {
      onSchedulerChanged(await fn());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleTarget = (id: number) =>
    setTargetIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const doStart = () => {
    setConfirmStart(false);
    void run(() =>
      api.startScheduler({
        accountIds: validTargets,
        minMinutes: Number(minMinutes),
        maxMinutes: Number(maxMinutes),
      }),
    );
  };

  return (
    <section className="panel">
      <h2>
        <span>ランダム投稿</span>
        <span className={`small ${STATE_LABEL[state].cls}`}>{STATE_LABEL[state].text}</span>
      </h2>

      {settings?.notice && <div className="notice warn small">{settings.notice}</div>}

      <div className="field">
        <div className="label">対象アカウント</div>
        {accounts.length === 0 ? (
          <span className="muted small">アカウントを追加してください</span>
        ) : (
          <div className="chips">
            {accounts.map((a) => (
              <label key={a.id} className={`chip ${validTargets.includes(a.id) ? "on" : ""}`}>
                <input
                  type="checkbox"
                  checked={validTargets.includes(a.id)}
                  onChange={() => toggleTarget(a.id)}
                  disabled={!editable}
                />
                @{a.username}
                {a.status !== "connected" && <span className="warn"> ⚠</span>}
              </label>
            ))}
            {editable && (
              <button
                className="link small"
                onClick={() => setTargetIds(accounts.filter((a) => a.selected).map((a) => a.id))}
              >
                左の選択をコピー
              </button>
            )}
          </div>
        )}
      </div>

      <div className="field row">
        <span className="label">投稿間隔</span>
        <span>最短</span>
        <input
          type="number"
          min={1}
          value={minMinutes}
          onChange={(e) => setMinMinutes(e.target.value)}
          disabled={!editable}
        />
        <span>分 ～ 最長</span>
        <input
          type="number"
          min={1}
          value={maxMinutes}
          onChange={(e) => setMaxMinutes(e.target.value)}
          disabled={!editable}
        />
        <span>分</span>
      </div>

      <details className="field">
        <summary>
          投稿プール：{pool.length}件<span className="muted small">（ON {enabledCount}件）</span>
        </summary>
        <PoolManager pool={pool} onChanged={onPoolChanged} />
      </details>

      <div className="row" style={{ marginTop: 10 }}>
        {state === "stopped" && (
          <button
            className="primary"
            onClick={() => setConfirmStart(true)}
            disabled={busy || validTargets.length === 0 || enabledCount === 0}
          >
            開始
          </button>
        )}
        {state === "running" && (
          <button onClick={() => run(api.pauseScheduler)} disabled={busy}>
            一時停止
          </button>
        )}
        {state === "paused" && (
          <button className="primary" onClick={() => run(api.resumeScheduler)} disabled={busy}>
            再開
          </button>
        )}
        <button className="danger" onClick={() => run(api.stopScheduler)} disabled={busy || state === "stopped"}>
          停止
        </button>
      </div>
      {error && <p className="err small">{error}</p>}

      {confirmStart && (
        <ConfirmDialog title="ランダム投稿を開始します" confirmLabel="開始" onConfirm={doStart} onCancel={() => setConfirmStart(false)}>
          <p className="small">
            {targetAccounts.map((a) => `@${a.username}`).join(", ")}
            <br />
            各アカウントが {minMinutes}〜{maxMinutes} 分のランダムな間隔で、ONの投稿候補 {enabledCount} 件から自動投稿します。
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
