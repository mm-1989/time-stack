// 起点 (origin) の定義: NOW (JST 本日 0:00:00) or 任意日時 (custom)。
// URL ?since=YYYY-MM-DD[THH:MM] でパース可能。

export type Origin =
  | { mode: 'now' }
  | { mode: 'custom'; date: Date }
  | { mode: 'countdown'; date: Date };

/** URL の ?since=YYYY-MM-DD or ?until=YYYY-MM-DD をパース。両方あれば until 優先。
 *  ?since=now は NOW モード (init 画面 skip)。 */
export function parseOriginFromUrl(url: URL): Origin | null {
  const untilStr = url.searchParams.get('until');
  if (untilStr) {
    const date = new Date(untilStr);
    if (!isNaN(date.getTime())) return { mode: 'countdown', date };
  }
  const sinceStr = url.searchParams.get('since');
  if (!sinceStr) return null;
  if (sinceStr === 'now') return { mode: 'now' };
  const date = new Date(sinceStr);
  if (isNaN(date.getTime())) return null;
  return { mode: 'custom', date };
}

/** Origin と現在時刻 (UTC ms) から VirtualClock の initialVirtualMs を計算。
 *  - NOW: 0 起点
 *  - CUSTOM: 起点日からの経過 (過去ほど大)
 *  - COUNTDOWN: 0 起点 (残時間は別途 HUD でメタ表示)
 */
export function initialMsForOrigin(origin: Origin, nowUtcMs: number): number {
  if (origin.mode === 'custom') return Math.max(0, nowUtcMs - origin.date.getTime());
  return 0;
}

/** 目標日までの残 ms。countdown モード以外なら null。 */
export function remainingMs(origin: Origin, nowUtcMs: number): number | null {
  if (origin.mode !== 'countdown') return null;
  return origin.date.getTime() - nowUtcMs;
}

/** URL クエリ用の datetime 文字列 (ISO 風 YYYY-MM-DDTHH:MM)。 */
export function formatDateForUrl(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
