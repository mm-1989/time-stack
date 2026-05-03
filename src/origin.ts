// 起点 (origin) の定義: NOW (JST 本日 0:00:00) or 任意日時 (custom)。
// URL ?since=YYYY-MM-DD[THH:MM] でパース可能。

import { elapsedSinceJstMidnight } from './time';

export type Origin = { mode: 'now' } | { mode: 'custom'; date: Date };

/** URL の ?since= をパースして Origin を返す。無効/無し なら null。 */
export function parseOriginFromUrl(url: URL): Origin | null {
  const sinceStr = url.searchParams.get('since');
  if (!sinceStr) return null;
  const date = new Date(sinceStr);
  if (isNaN(date.getTime())) return null;
  return { mode: 'custom', date };
}

/** Origin と現在時刻 (UTC ms) から VirtualClock の initialVirtualMs を計算。 */
export function initialMsForOrigin(origin: Origin, nowUtcMs: number): number {
  if (origin.mode === 'now') {
    return elapsedSinceJstMidnight(nowUtcMs);
  }
  return Math.max(0, nowUtcMs - origin.date.getTime());
}

/** URL クエリ用の datetime 文字列 (ISO 風 YYYY-MM-DDTHH:MM)。 */
export function formatDateForUrl(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
