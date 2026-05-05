// 仮想時計: 経過時間を speed 倍で進ませる。freeze で一時停止、skip で前進可。
export class VirtualClock {
  private virtualMs: number;
  private lastWall: number;
  readonly speed: number;
  frozen = false;

  constructor(speed: number, initialWallMs: number, initialVirtualMs = 0) {
    this.speed = speed;
    this.lastWall = initialWallMs;
    this.virtualMs = initialVirtualMs;
  }

  /** wall clock の現在時刻を渡し、進めた virtualMs を返す */
  tick(wallMs: number): number {
    const delta = wallMs - this.lastWall;
    this.lastWall = wallMs;
    if (!this.frozen) this.virtualMs += delta * this.speed;
    return this.virtualMs;
  }

  /** virtualMs に直接加算 (skip キー用) */
  skip(deltaMs: number): void {
    this.virtualMs += deltaMs;
  }

  /** virtualMs を直接書き換え (マスクリック ジャンプ用) */
  setVirtualMs(ms: number): void {
    this.virtualMs = ms;
  }

  toggleFreeze(): void {
    this.frozen = !this.frozen;
  }
}

// JST (UTC+9) 上での「本日 0:00:00」から、指定 UTC ms までの経過 ms。
// VirtualClock の起点を「JST 本日 0:00:00」にしたい時に渡す。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export function elapsedSinceJstMidnight(nowUtcMs: number): number {
  const jstWallMs = nowUtcMs + JST_OFFSET_MS;
  return ((jstWallMs % 86_400_000) + 86_400_000) % 86_400_000;
}

/** 現在の JST 壁時計を hh:mm:ss でフォーマット */
export function formatJstClock(nowUtcMs: number): string {
  const ms = elapsedSinceJstMidnight(nowUtcMs);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor(totalSec / 60) % 60;
  const s = totalSec % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 起点 (originMs, UTC ms) から virtualMs だけ進んだ時刻を、年/月/日/時/分/秒の
 * 暦差分として返す。365.25 日割りの近似ではなく、実カレンダーで正確に計算する。
 *
 * ?since=1990-04-15 の人が 2026-05-05 時点で「36y 0mo 20d HH:MM:SS」と読めるように。
 * 月の長さは 28〜31 日で動的に変わるため、virtualNow.getDate() を起点側と比較し
 * 借入 (carry) を行う必要がある。
 */
export interface CalendarBreakdown {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function calendarBreakdown(
  originMs: number,
  virtualMs: number,
): CalendarBreakdown {
  if (virtualMs < 0) virtualMs = 0;
  const start = new Date(originMs);
  const end = new Date(originMs + virtualMs);

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  let hours = end.getHours() - start.getHours();
  let minutes = end.getMinutes() - start.getMinutes();
  let seconds = end.getSeconds() - start.getSeconds();

  // 下位から繰り下げ (秒 → 分 → 時 → 日 → 月 → 年)
  if (seconds < 0) { seconds += 60; minutes -= 1; }
  if (minutes < 0) { minutes += 60; hours -= 1; }
  if (hours < 0) { hours += 24; days -= 1; }
  if (days < 0) {
    // 直前月の日数を借りる: end の前月末の日付
    const prevMonthLastDay = new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    days += prevMonthLastDay;
    months -= 1;
  }
  if (months < 0) { months += 12; years -= 1; }

  return { years, months, days, hours, minutes, seconds };
}
