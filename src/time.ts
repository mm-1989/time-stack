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

/**
 * 月命日が当該月に存在しない場合 (例: 起点 1/31 → 4 月は 30 日まで) の
 * クランプ。`day` を `(year, month)` の月末日 (28〜31) で頭打ちにする。
 *  - うるう年 2/29 起点 → 平年 2 月は 28 日扱い
 *  - 1/31 起点 → 4 月は 30 日扱い
 */
export function clampDay(year: number, month: number, day: number): number {
  // new Date(y, m+1, 0) の date 部 = 当該月の末日
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(day, lastDay);
}

/** anniversary 起点の月フレーム/年フレームの結果 */
export interface AnniversaryFrame {
  /** 当該アンカー期間のマス数。月: 28〜31、年: 12 固定 */
  count: number;
  /** 0 ≤ filled ≤ count、小数あり */
  filled: number;
}

/**
 * `originMs` の day-of-month を毎月の境界として、`wallMs` 時点での
 * 「現在の月アンカーサイクル内位置」を返す。
 *
 *  - 直近アンカー = wallMs 以前で最も近い「同じ day-of-month」の日付
 *    (なければ前月のクランプ済 anniversary 日付)
 *  - count = 直近アンカーから次アンカーまでの日数 (= 当該サイクル長)
 *  - filled = (wallMs - 直近アンカー) を 1 日 ms で割った経過日数 (小数)
 *
 * 例: origin=1992-07-25 12:00, wall=2026-05-05 18:11
 *   → 直近アンカー 2026-04-25 12:00 (= origin と同じ day-of-month で wallMs 以前最近接)
 *   → count = 2026-04-25 → 2026-05-25 = 30 日
 *   → filled ≈ 10.26 (10 日 6 時間 11 分)
 */
export function anniversaryMonthFrame(
  originMs: number,
  wallMs: number,
): AnniversaryFrame {
  const origin = new Date(originMs);
  const wall = new Date(wallMs);
  // origin の time-of-day と day-of-month を保持して、wall の年月で組み立てる。
  // 月末日を超える origin day はクランプ。
  const oDay = origin.getDate();
  const oH = origin.getHours();
  const oM = origin.getMinutes();
  const oS = origin.getSeconds();
  const oMs = origin.getMilliseconds();

  // wall の年月で「同じ日時」を作る (= 当月のアンカー候補)
  let anchorY = wall.getFullYear();
  let anchorMo = wall.getMonth();
  let anchorD = clampDay(anchorY, anchorMo, oDay);
  let anchor = new Date(anchorY, anchorMo, anchorD, oH, oM, oS, oMs).getTime();
  // wall がアンカー候補より前なら、前月にずらす
  if (anchor > wallMs) {
    anchorMo -= 1;
    if (anchorMo < 0) { anchorMo = 11; anchorY -= 1; }
    anchorD = clampDay(anchorY, anchorMo, oDay);
    anchor = new Date(anchorY, anchorMo, anchorD, oH, oM, oS, oMs).getTime();
  }
  // 次アンカー (= 1 ヶ月後の同 day-of-month、クランプ含)
  let nextY = anchorY;
  let nextMo = anchorMo + 1;
  if (nextMo > 11) { nextMo = 0; nextY += 1; }
  const nextD = clampDay(nextY, nextMo, oDay);
  const nextAnchor = new Date(nextY, nextMo, nextD, oH, oM, oS, oMs).getTime();

  const cycleMs = nextAnchor - anchor;
  const elapsedMs = wallMs - anchor;
  const count = Math.round(cycleMs / 86_400_000);
  const filled = elapsedMs / 86_400_000;
  return { count, filled };
}

/**
 * `originMs` の (month, day) を毎年の境界として、`wallMs` 時点での
 * 「現在の年アンカーサイクル内位置」(= 経過月数、小数) を返す。
 *
 *  - count は常に 12
 *  - filled = 直近 yearly anniversary からの経過月数 (calendarBreakdown 経由)
 */
export function anniversaryYearFrame(
  originMs: number,
  wallMs: number,
): AnniversaryFrame {
  const origin = new Date(originMs);
  const wall = new Date(wallMs);
  const oMo = origin.getMonth();
  const oDay = origin.getDate();
  const oH = origin.getHours();
  const oM = origin.getMinutes();
  const oS = origin.getSeconds();
  const oMs = origin.getMilliseconds();

  // wall の年で同 (month, day) を組む。クランプ込。
  let anchorY = wall.getFullYear();
  let anchorD = clampDay(anchorY, oMo, oDay);
  let anchor = new Date(anchorY, oMo, anchorD, oH, oM, oS, oMs).getTime();
  if (anchor > wallMs) {
    anchorY -= 1;
    anchorD = clampDay(anchorY, oMo, oDay);
    anchor = new Date(anchorY, oMo, anchorD, oH, oM, oS, oMs).getTime();
  }
  // calendarBreakdown で経過月数 (+ 月内日数) を算出して filled に変換
  const bd = calendarBreakdown(anchor, wallMs - anchor);
  // bd.years は 0 のはず (1 年未満)。月数 + 当月内日進捗で fractional に。
  const nextY = anchorY + 1;
  const nextD = clampDay(nextY, oMo, oDay);
  const nextAnchor = new Date(nextY, oMo, nextD, oH, oM, oS, oMs).getTime();
  // 当月内 fractional 部分: bd.months 番目の月の日数で正規化
  const monthAnchorY = bd.months === 11
    ? nextY
    : anchorY + (oMo + bd.months >= 12 ? 1 : 0);
  const monthAnchorMo = (oMo + bd.months) % 12;
  const monthEndY = monthAnchorMo === 11 ? monthAnchorY + 1 : monthAnchorY;
  const monthEndMo = (monthAnchorMo + 1) % 12;
  const monthAnchor = new Date(
    monthAnchorY,
    monthAnchorMo,
    clampDay(monthAnchorY, monthAnchorMo, oDay),
    oH, oM, oS, oMs,
  ).getTime();
  const monthEnd = new Date(
    monthEndY,
    monthEndMo,
    clampDay(monthEndY, monthEndMo, oDay),
    oH, oM, oS, oMs,
  ).getTime();
  const monthFrac = (wallMs - monthAnchor) / (monthEnd - monthAnchor);
  // クリップ (race / 端数で 0..1 の外に出ないように)
  const safeFrac = Math.max(0, Math.min(1, monthFrac));
  // 防御: bd.years > 0 が起きたら filled をサイクル末端 (12) 直前にする
  const filled = bd.years > 0 ? 12 - 1e-9 : bd.months + safeFrac;
  // nextAnchor は計算値の検証参考にしか使わない (sanity)
  void nextAnchor;
  return { count: 12, filled };
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
