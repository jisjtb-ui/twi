import type { Account } from "../api/types";
import { formatTime } from "../format";
import { Avatar } from "./Avatar";

interface Props {
  accounts: Account[];
  onToggle: (account: Account) => void;
  onSelectAll: (selected: boolean) => void;
  onReauth: (account: Account) => void;
  onDelete: (account: Account) => void;
}

export function AccountList({ accounts, onToggle, onSelectAll, onReauth, onDelete }: Props) {
  const selectedCount = accounts.filter((a) => a.selected).length;
  return (
    <section className="panel area-accounts">
      <h2>
        <span>アカウント</span>
        <span className="small">
          {selectedCount} / {accounts.length} 選択中
        </span>
      </h2>

      {accounts.length === 0 ? (
        <p className="muted small">
          まだアカウントがありません。右上の「＋アカウント追加」から X にログインして追加してください。
        </p>
      ) : (
        <ul className="account-list">
          {accounts.map((a) => (
            <li key={a.id} className="account">
              <input
                type="checkbox"
                checked={a.selected}
                onChange={() => onToggle(a)}
                aria-label={`@${a.username} を選択`}
              />
              <Avatar account={a} />
              <div className="names">
                <div>
                  @{a.username}{" "}
                  {a.status === "connected" ? (
                    <span className="badge ok">● 接続済</span>
                  ) : (
                    <span className="badge warn">⚠ 再認証必要</span>
                  )}
                </div>
                <div className="muted small">
                  {a.displayName}
                  {a.isMock ? "（ダミー）" : ""}
                </div>
                <div className="muted small">最終投稿 {formatTime(a.lastPostAt)}</div>
              </div>
              <div className="actions">
                <button className="link small" onClick={() => onReauth(a)} title="X で再ログイン・再認可">
                  再認証
                </button>
                <button className="link small danger" onClick={() => onDelete(a)}>
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="row">
        <button onClick={() => onSelectAll(true)} disabled={accounts.length === 0}>
          全選択
        </button>
        <button onClick={() => onSelectAll(false)} disabled={accounts.length === 0}>
          全解除
        </button>
      </div>
    </section>
  );
}
