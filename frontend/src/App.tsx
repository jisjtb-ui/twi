import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api/client";
import type { Account } from "./api/types";
import { AccountList } from "./components/AccountList";
import { ConfirmDialog } from "./components/ConfirmDialog";

export function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [mock, setMock] = useState(false);
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

  useEffect(() => {
    api.health().then((h) => setMock(h.mock), showError);
    void reload();
  }, [reload]);

  const addAccount = async () => {
    setError(null);
    try {
      await api.addMockAccount();
      await reload();
    } catch (err) {
      showError(err);
    }
  };

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
          {mock && <span className="small warn">モックモード（X API を呼びません）</span>}
          <button className="primary" onClick={addAccount}>
            ＋アカウント追加
          </button>
        </div>
      </header>

      <main className="main">
        {error && (
          <div className="notice err" style={{ gridColumn: "1 / -1" }}>
            <div className="row">
              <span className="err">{error}</span>
              <span className="spacer" />
              <button className="link" onClick={() => setError(null)}>
                閉じる
              </button>
            </div>
          </div>
        )}

        <AccountList
          accounts={accounts}
          onToggle={toggle}
          onSelectAll={selectAll}
          onReauth={() => setError("再認証は Phase 2 で実装予定です")}
          onDelete={setDeleting}
        />

        <div className="area-work">
          <section className="panel">
            <h2>一括投稿</h2>
            <p className="muted small">Phase 4 で実装予定</p>
          </section>
          <section className="panel">
            <h2>ランダム投稿</h2>
            <p className="muted small">Phase 5・6 で実装予定</p>
          </section>
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
