import { useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import type { Account, PostResult } from "../api/types";
import { MAX_WEIGHTED_LENGTH, weightedLength } from "../textCount";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  accounts: Account[];
  onPosted: () => void;
}

export function BulkPost({ accounts, onPosted }: Props) {
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [posting, setPosting] = useState(false);
  const [results, setResults] = useState<PostResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // state 更新前の連打もブロックする
  const inFlight = useRef(false);

  const targets = accounts.filter((a) => a.selected);
  const length = weightedLength(text.trim());
  const canPost = text.trim().length > 0 && targets.length > 0 && !posting;

  const submit = async () => {
    setConfirming(false);
    if (inFlight.current) return;
    inFlight.current = true;
    setPosting(true);
    setError(null);
    setResults(null);
    try {
      const { results } = await api.bulkPost(
        crypto.randomUUID(),
        text,
        targets.map((a) => a.id),
      );
      setResults(results);
      if (results.every((r) => r.ok)) setText("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setPosting(false);
      onPosted();
    }
  };

  return (
    <section className="panel">
      <h2>一括投稿</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="投稿内容"
        rows={4}
        disabled={posting}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <span className={`small ${length > MAX_WEIGHTED_LENGTH ? "warn" : "muted"}`}>
          {length} / {MAX_WEIGHTED_LENGTH}
          {length > MAX_WEIGHTED_LENGTH && "（通常アカウントでは文字数超過で失敗します）"}
        </span>
        <span className="spacer" />
        <span className="small muted">
          投稿先：
          {targets.length === 0 ? "未選択（左の一覧でチェック）" : targets.map((a) => `@${a.username}`).join(", ")}
        </span>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="primary" onClick={() => setConfirming(true)} disabled={!canPost}>
          {posting ? "投稿中…" : "選択したアカウントへ投稿"}
        </button>
      </div>

      {error && <p className="err small">{error}</p>}

      {results && (
        <ul className="list" style={{ marginTop: 10 }}>
          {results.map((r) => (
            <li key={r.accountId} className="row">
              <span>@{r.username}</span>
              {r.ok ? <span className="ok">✓ 投稿成功</span> : <span className="err">✕ 投稿失敗</span>}
              {!r.ok && <span className="small muted">{r.errorMessage}</span>}
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <ConfirmDialog
          title={`${targets.length}アカウントへ投稿します`}
          confirmLabel="投稿する"
          onConfirm={submit}
          onCancel={() => setConfirming(false)}
        >
          <div className="preview">{text.trim()}</div>
          <p className="small muted">{targets.map((a) => `@${a.username}`).join(", ")}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
