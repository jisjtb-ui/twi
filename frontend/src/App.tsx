import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api/client";
import type { Account, Health, PoolItem } from "./api/types";
import { AccountList } from "./components/AccountList";
import { BulkPost } from "./components/BulkPost";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { OAuthBanner } from "./components/OAuthBanner";
import { RandomPost } from "./components/RandomPost";
import { useOAuthFlow } from "./hooks/useOAuthFlow";

export function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pool, setPool] = useState<PoolItem[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);

  const showError = (err: unknown) => setError(err instanceof ApiError ? err.message : String(err));

  const reload = useCallback(async () => {
    try {
      setAccounts(await api.listAccounts());
    } catch (err) {
      showError(err);
    }
  }, []);

  const reloadPool = useCallback(async () => {
    try {
      setPool(await api.listPool());
    } catch (err) {
      showError(err);
    }
  }, []);

  useEffect(() => {
    api.health().then(setHealth, showError);
    void reload();
    void reloadPool();
  }, [reload, reloadPool]);

  const oauth = useOAuthFlow(reload);

  // X の画面から戻ってきたときに最新状態を反映
  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const toggle = async (a: Account) => {
    setAccounts((list) => list.map((x) => (x.id === a.id ? { ...x, selected: !a.selected } : x)));
    try {
      await api.setAccountSelected(a.id, !a.selected);
    } catch (err) {
      showError(err);
      await reload();
    }
  };

  const selectAll = async (selected: boolean) => {
    try {
      setAccounts(await api.setAllSelected(selected));
    } catch (err) {
      showError(err);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      await api.deleteAccount(target.id);
      await reload();
    } catch (err) {
      showError(err);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>X Multi Poster</h1>
        <div className="right">
          {health?.mock && <span className="small warn">モックモード（X API を呼びません）</span>}
          <button className="primary" onClick={() => oauth.start(null)} disabled={oauth.state.phase === "waiting"}>
            ＋アカウント追加
          </button>
        </div>
      </header>

      <div className="notices">
        {health && !health.xConfigured && (
          <div className="notice warn">
            X_CLIENT_ID が未設定です。README の「初期設定」に従って .env を設定し、アプリを再起動してください。
          </div>
        )}
        <OAuthBanner state={oauth.state} onClose={oauth.cancel} />
        {error && (
          <div className="notice err">
            <div className="row">
              <span className="err">{error}</span>
              <span className="spacer" />
              <button className="link" onClick={() => setError(null)}>
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>

      <main className="main">
        <AccountList
          accounts={accounts}
          onToggle={toggle}
          onSelectAll={selectAll}
          onReauth={(a) => oauth.start(a)}
          onDelete={setDeleting}
        />

        <div className="area-work">
          <BulkPost accounts={accounts} onPosted={reload} />
          <RandomPost accounts={accounts} pool={pool} onPoolChanged={reloadPool} />
        </div>

        <section className="panel area-next">
          <h2>次回投稿</h2>
          <p className="muted small">予定はありません</p>
        </section>

        <section className="panel area-history">
          <h2>投稿履歴</h2>
          <p className="muted small">履歴はありません</p>
        </section>
      </main>

      {deleting && (
        <ConfirmDialog
          title={`@${deleting.username} を削除しますか？`}
          confirmLabel="削除"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          <p className="muted small">
            このアプリから接続情報を削除します。X 側のアカウントには影響しません。
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
