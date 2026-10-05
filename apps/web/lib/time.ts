/**
 * 时间显示：三种粒度，各有各的场合。集中在这里，免得每个页面各写一份、格式还各不相同。
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** HH:MM —— 目录这类窄栏用，只要够分清先后 */
export function hhmm(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** HH:MM:SS —— 消息流里用，同分钟内多条时要能排出次序 */
export function hhmmss(ts: number): string {
  const d = new Date(ts);
  return `${hhmm(ts)}:${pad(d.getSeconds())}`;
}

/** 最近一条消息是什么时候：今天/昨天给时刻，更早给日期 */
export function relTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `今天 ${hhmm(ts)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${hhmm(ts)}`;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
