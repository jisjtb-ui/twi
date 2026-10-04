/** "10:32" 形式。日付が今日でなければ "10/05 10:32" */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const hm = d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return hm;
  const md = d.toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" });
  return `${md} ${hm}`;
}
