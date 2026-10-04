import { useState } from "react";
import { api, ApiError } from "../api/client";
import type { PoolItem } from "../api/types";

interface Props {
  pool: PoolItem[];
  onChanged: () => void;
}

/** 投稿プール（ランダム投稿の候補）の追加・編集・削除・ON/OFF */
export function PoolManager({ pool, onChanged }: Props) {
  const [lines, setLines] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const lineCount = lines.split(/\r?\n/).filter((l) => l.trim()).length;

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      setMessage(success ? { ok: true, text: success } : null);
      onChanged();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const addLines = () =>
    run(async () => {
      const { added } = await api.addPoolLines(lines);
      setLines("");
      setMessage({ ok: true, text: `${added}件の投稿候補を登録しました` });
    });

  const saveEdit = (item: PoolItem) =>
    run(async () => {
      await api.updatePoolItem(item.id, { content: editText });
      setEditingId(null);
    });

  return (
    <div>
      <textarea
        value={lines}
        onChange={(e) => setLines(e.target.value)}
        placeholder={"1行＝1投稿として登録します\n今日も疲れた\nおはよう\n眠い"}
        rows={4}
        disabled={busy}
      />
      <div className="row" style={{ marginTop: 6 }}>
        <button onClick={addLines} disabled={busy || lineCount === 0}>
          {lineCount > 0 ? `${lineCount}件を追加` : "追加"}
        </button>
        {message && <span className={`small ${message.ok ? "ok" : "err"}`}>{message.text}</span>}
      </div>

      {pool.length > 0 && (
        <ul className="list pool-list" style={{ marginTop: 10 }}>
          {pool.map((item, i) => (
            <li key={item.id} className="pool-item">
              <input
                type="checkbox"
                checked={item.enabled}
                title={item.enabled ? "ON（ランダム投稿の対象）" : "OFF（対象外）"}
                onChange={() => run(() => api.updatePoolItem(item.id, { enabled: !item.enabled }))}
                disabled={busy}
              />
              <span className="muted small mono">{i + 1}.</span>
              {editingId === item.id ? (
                <>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    autoFocus
                    style={{ minHeight: 0 }}
                  />
                  <span className="row" style={{ flexWrap: "nowrap" }}>
                    <button className="link small" onClick={() => saveEdit(item)} disabled={busy || !editText.trim()}>
                      保存
                    </button>
                    <button className="link small" onClick={() => setEditingId(null)}>
                      取消
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <span className={`pool-content ${item.enabled ? "" : "muted"}`}>{item.content}</span>
                  <span className="row" style={{ flexWrap: "nowrap" }}>
                    <button
                      className="link small"
                      onClick={() => {
                        setEditingId(item.id);
                        setEditText(item.content);
                      }}
                    >
                      編集
                    </button>
                    <button
                      className="link small danger"
                      onClick={() => run(() => api.deletePoolItem(item.id))}
                      disabled={busy}
                    >
                      削除
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
