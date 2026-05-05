// SUMMARY ビュー: これまで積み重なった時を一望できる overlay。
//
// 構成:
//   - C (PROGRESS):  全 5 スケールの進捗を bar + x/y で並列表示。常時利用可。
//   - D (AGGREGATE): 累積数値 (sec/min/hour/day/year) を絶対量で。Hour スケール
//                     アンロック後に出現。
//   - LIFETIME:      ?since= の custom origin かつ Hour アンロック後のみ。
//                     平均寿命 (80y) との対比を x/y で。
//
// % 表記は使わず、すべて「x / y (分母分子明示)」で具体感を保つ。

import type { Origin } from './origin';
import { SCALES, snapshotScale, type ResolveContext, type ScaleId } from './scales';
import { calendarBreakdown } from './time';
import { t } from './i18n';

export interface SummaryAPI {
  show(): void;
  hide(): void;
  toggle(): void;
  isVisible(): boolean;
  /** virtualMs / origin / hour アンロック状態 / 暦起点 ms を渡して表示更新 */
  update(
    virtualMs: number,
    origin: Origin | undefined,
    hourUnlocked: boolean,
    originStartMs: number,
  ): void;
}

const SCALE_LIST: ScaleId[] = ['minute', 'hour', 'day', 'month', 'year'];

/** 平均寿命 (年)。LIFETIME 比較の denominator。慣習的な 80 年。 */
const AVG_LIFE_YEARS = 80;
const DAYS_PER_YEAR = 365.25;
const MS_PER_DAY = 86_400_000;

export function createSummary(parent: HTMLElement): SummaryAPI {
  // 開閉ボタン (画面右上に常駐)
  const btn = document.createElement('button');
  btn.className = 'summary-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', t('summary.open'));
  btn.textContent = 'Σ';
  parent.appendChild(btn);

  // モーダル overlay
  const overlay = document.createElement('div');
  overlay.className = 'summary-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('summary.title'));
  overlay.innerHTML = `
    <div class="summary-modal" role="document">
      <button class="summary-close" type="button" aria-label="${t('summary.close')}">×</button>
      <h2 class="summary-title">&gt;&nbsp;SYSTEM SUMMARY</h2>
      <div class="summary-body"></div>
    </div>
  `;
  parent.appendChild(overlay);

  const body = overlay.querySelector<HTMLDivElement>('.summary-body')!;
  const closeBtn = overlay.querySelector<HTMLButtonElement>('.summary-close')!;
  const modal = overlay.querySelector<HTMLDivElement>('.summary-modal')!;

  let visible = false;

  function show(): void {
    visible = true;
    overlay.classList.add('show');
    btn.setAttribute('aria-expanded', 'true');
  }
  function hide(): void {
    visible = false;
    overlay.classList.remove('show');
    btn.setAttribute('aria-expanded', 'false');
  }
  function toggle(): void {
    if (visible) hide();
    else show();
  }

  btn.addEventListener('click', toggle);
  closeBtn.addEventListener('click', hide);
  overlay.addEventListener('click', (e) => {
    // 背景タップで閉じる。modal 内クリックは止める
    if (e.target === overlay) hide();
  });
  modal.addEventListener('click', (e) => e.stopPropagation());
  window.addEventListener('keydown', (e) => {
    if (visible && e.code === 'Escape') hide();
  });

  function update(
    virtualMs: number,
    origin: Origin | undefined,
    hourUnlocked: boolean,
    originStartMs: number,
  ): void {
    if (!visible) return;
    body.innerHTML = renderHTML(virtualMs, origin, hourUnlocked, originStartMs);
  }

  return { show, hide, toggle, isVisible: () => visible, update };
}

function renderHTML(
  virtualMs: number,
  origin: Origin | undefined,
  hourUnlocked: boolean,
  originStartMs: number,
): string {
  const wallMs = Date.now();
  const ctx: ResolveContext | undefined = origin
    ? { originMs: originStartMs, originMode: origin.mode }
    : undefined;
  const isCountdown = origin?.mode === 'countdown';
  // countdown 用に残時間 ms を計算 (target - now)。負値は 0 にクランプ。
  const remainingMs = isCountdown && origin
    ? Math.max(0, origin.date.getTime() - wallMs)
    : 0;
  return [
    renderHeader(virtualMs, origin, wallMs, originStartMs, isCountdown, remainingMs),
    renderProgress(virtualMs, wallMs, ctx, isCountdown),
    hourUnlocked
      ? (isCountdown ? renderAggregateRemaining(remainingMs) : renderAggregate(virtualMs))
      : '',
    hourUnlocked && origin?.mode === 'custom'
      ? renderLifetime(virtualMs, origin.date)
      : '',
    renderOriginInfo(origin),
  ].join('');
}

/** 経過時間 (暦 breakdown) + 壁時計。countdown では REMAINING を主表示。 */
function renderHeader(
  virtualMs: number,
  _origin: Origin | undefined,
  wallMs: number,
  originStartMs: number,
  isCountdown: boolean,
  remainingMs: number,
): string {
  const wd = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(wallMs).getDay()];
  const wall = formatJstWall(wallMs);
  // countdown は target - now の breakdown、それ以外は origin → now の累積 breakdown
  const mainKey = isCountdown ? 'REMAINING' : 'ELAPSED';
  const mainVal = isCountdown
    ? formatBreakdown(wallMs, remainingMs)
    : formatBreakdown(originStartMs, virtualMs);
  return `
    <div class="summary-header">
      <div class="summary-row-h">
        <span class="summary-key">${mainKey}</span>
        <span class="summary-val">${escapeHtml(mainVal)}</span>
      </div>
      <div class="summary-row-h">
        <span class="summary-key">WALL CLOCK</span>
        <span class="summary-val">${wd} · ${escapeHtml(wall)} JST</span>
      </div>
    </div>
  `;
}

/** C: 各スケールの進捗バー + x/y + (X%) 併記。
 *  countdown mode のときは snapshotScale が filled を反転して返す (= 残マス数)。
 *  ラベルも "PROGRESS" → "REMAINING" に切り替えてセマンティクスを明示。 */
function renderProgress(
  virtualMs: number,
  wallMs: number,
  ctx: ResolveContext | undefined,
  isCountdown: boolean,
): string {
  const rows = SCALE_LIST.map((id) => {
    const s = SCALES[id];
    const snap = snapshotScale(s, virtualMs, wallMs, ctx);
    const filled = Math.floor(snap.filled);
    const ratio = Math.max(0, Math.min(1, snap.filled / snap.count));
    const label = s.shortLabel.toUpperCase();
    return `
      <div class="summary-prog-row" style="--p:${ratio};--c:${s.fillColor};">
        <span class="summary-prog-label">${label}</span>
        <div class="summary-prog-bar"><div class="summary-prog-fill"></div></div>
        <span class="summary-prog-num">${filled} / ${snap.count} <span class="summary-pct">(${formatPct(ratio)})</span></span>
      </div>
    `;
  }).join('');
  const heading = isCountdown ? 'REMAINING' : 'PROGRESS';
  return `
    <section class="summary-section">
      <h3 class="summary-h3">${heading}</h3>
      ${rows}
    </section>
  `;
}

/** D-countdown: 残時間の絶対量 (Hour アンロック後 + countdown のみ)。
 *  累積版 (renderAggregate) と対称的に「target までの残り N 秒/分/時/日/年」を出す。 */
function renderAggregateRemaining(remainingMs: number): string {
  const seconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(remainingMs / 3_600_000);
  const days = Math.floor(remainingMs / MS_PER_DAY);
  const years = remainingMs / (DAYS_PER_YEAR * MS_PER_DAY);
  const yearsTxt = years >= 1 ? Math.floor(years).toLocaleString() : years.toFixed(2);
  return `
    <section class="summary-section">
      <h3 class="summary-h3">TOTAL REMAINING</h3>
      <div class="summary-agg">
        <div><span class="summary-num-big">${seconds.toLocaleString()}</span><span class="summary-unit">SEC</span></div>
        <div><span class="summary-num-big">${minutes.toLocaleString()}</span><span class="summary-unit">MIN</span></div>
        <div><span class="summary-num-big">${hours.toLocaleString()}</span><span class="summary-unit">HOUR</span></div>
        <div><span class="summary-num-big">${days.toLocaleString()}</span><span class="summary-unit">DAY</span></div>
        <div><span class="summary-num-big">${yearsTxt}</span><span class="summary-unit">YEAR</span></div>
      </div>
    </section>
  `;
}

/** D: 累積数値 (Hour アンロック後) */
function renderAggregate(virtualMs: number): string {
  const seconds = Math.floor(virtualMs / 1000);
  const minutes = Math.floor(virtualMs / 60_000);
  const hours = Math.floor(virtualMs / 3_600_000);
  const days = Math.floor(virtualMs / MS_PER_DAY);
  const years = virtualMs / (DAYS_PER_YEAR * MS_PER_DAY);
  // 0.0x 年で 0 と出ると寂しいので 2 桁小数まで保持
  const yearsTxt = years >= 1 ? Math.floor(years).toLocaleString() : years.toFixed(2);
  return `
    <section class="summary-section">
      <h3 class="summary-h3">AGGREGATE</h3>
      <div class="summary-agg">
        <div><span class="summary-num-big">${seconds.toLocaleString()}</span><span class="summary-unit">SEC</span></div>
        <div><span class="summary-num-big">${minutes.toLocaleString()}</span><span class="summary-unit">MIN</span></div>
        <div><span class="summary-num-big">${hours.toLocaleString()}</span><span class="summary-unit">HOUR</span></div>
        <div><span class="summary-num-big">${days.toLocaleString()}</span><span class="summary-unit">DAY</span></div>
        <div><span class="summary-num-big">${yearsTxt}</span><span class="summary-unit">YEAR</span></div>
      </div>
    </section>
  `;
}

/** LIFETIME: 平均寿命との対比 (custom origin + Hour アンロック後のみ) */
function renderLifetime(virtualMs: number, originDate: Date): string {
  const days = virtualMs / MS_PER_DAY;
  const hours = virtualMs / 3_600_000;
  const years = days / DAYS_PER_YEAR;

  const lifeYears = AVG_LIFE_YEARS;
  const lifeDays = Math.floor(lifeYears * DAYS_PER_YEAR);
  const lifeHours = lifeDays * 24;

  const ratio = years / lifeYears;
  const yYrs = years.toFixed(1);
  const yDays = Math.floor(days).toLocaleString();
  const yHours = Math.floor(hours).toLocaleString();

  return `
    <section class="summary-section">
      <h3 class="summary-h3">LIFETIME &nbsp;<span class="summary-h3-sub">(avg ${lifeYears}y)</span></h3>
      <div class="summary-life">
        <div class="summary-life-row">
          <span>YEARS</span>
          <span class="summary-life-num">${yYrs} / ${lifeYears} <span class="summary-pct">(${formatPct(ratio)})</span></span>
        </div>
        <div class="summary-life-row">
          <span>DAYS</span>
          <span class="summary-life-num">${yDays} / ${lifeDays.toLocaleString()} <span class="summary-pct">(${formatPct(ratio)})</span></span>
        </div>
        <div class="summary-life-row">
          <span>HOURS</span>
          <span class="summary-life-num">${yHours} / ${lifeHours.toLocaleString()} <span class="summary-pct">(${formatPct(ratio)})</span></span>
        </div>
        <div class="summary-life-meta">FROM ${formatYmd(originDate)}</div>
      </div>
    </section>
  `;
}

function renderOriginInfo(origin: Origin | undefined): string {
  if (!origin) return '';
  if (origin.mode === 'now') {
    return `<div class="summary-foot">ORIGIN: NOW (start of session)</div>`;
  }
  if (origin.mode === 'countdown') {
    return `<div class="summary-foot">TARGET: ${formatYmd(origin.date)}</div>`;
  }
  return `<div class="summary-foot">ORIGIN: ${formatYmd(origin.date)}</div>`;
}

// ---- formatting helpers ----

function pad2(n: number): string { return String(n).padStart(2, '0'); }

/**
 * 暦 breakdown を `1y 6mo(78w) 14d HH:MM:SS` 風に整形。
 * 経過 2 年未満 かつ MO 表示粒度のときは MO の直後に累計週数を併記。
 * 上位の 0 単位は省略。
 */
function formatBreakdown(originStartMs: number, virtualMs: number): string {
  const bd = calendarBreakdown(originStartMs, virtualMs);
  const time = `${pad2(bd.hours)}:${pad2(bd.minutes)}:${pad2(bd.seconds)}`;
  const totalWeeks = Math.floor(Math.max(0, virtualMs) / (7 * 86_400_000));
  const showWeeks = bd.years < 2 && (bd.years > 0 || bd.months > 0);
  const moPart = showWeeks
    ? `${bd.months}mo(${totalWeeks}w)`
    : `${bd.months}mo`;
  if (bd.years > 0) return `${bd.years}y ${moPart} ${bd.days}d ${time}`;
  if (bd.months > 0) return `${moPart} ${bd.days}d ${time}`;
  if (bd.days > 0) return `${bd.days}d ${time}`;
  return time;
}

/**
 * % フォーマット。極小値も視認できるよう桁数を可変にする:
 *  ratio < 0.001 → "0.0X%"
 *  < 0.1        → "X.X%"
 *  >= 0.1       → "X%" (整数)
 */
function formatPct(ratio: number): string {
  const p = ratio * 100;
  if (p < 0.1 && p > 0) return `${p.toFixed(2)}%`;
  if (p < 10) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
}

function formatJstWall(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}  ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

const SUMMARY_WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${SUMMARY_WEEKDAY[d.getDay()]}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
