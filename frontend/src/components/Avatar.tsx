import type { Account } from "../api/types";

export function Avatar({ account }: { account: Account }) {
  if (account.avatarUrl) {
    return <img className="avatar" src={account.avatarUrl} alt="" referrerPolicy="no-referrer" />;
  }
  return <div className="avatar">{account.username.slice(0, 1).toUpperCase()}</div>;
}
