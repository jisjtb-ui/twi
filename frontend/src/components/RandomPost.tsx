import type { Account, PoolItem } from "../api/types";
import { PoolManager } from "./PoolManager";

interface Props {
  accounts: Account[];
  pool: PoolItem[];
  onPoolChanged: () => void;
}

export function RandomPost({ pool, onPoolChanged }: Props) {
  const enabledCount = pool.filter((p) => p.enabled).length;
  return (
    <section className="panel">
      <h2>ランダム投稿</h2>
      <details>
        <summary>
          投稿プール：{pool.length}件
          <span className="muted small">（ON {enabledCount}件）</span>
        </summary>
        <PoolManager pool={pool} onChanged={onPoolChanged} />
      </details>
    </section>
  );
}
