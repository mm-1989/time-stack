// 周辺 DOM ウィジェット (sound-indicator, hover tooltip, mouse parallax) のセットアップ。
// メインロジックから切り離して main.ts を軽量化する。

import type { TimeGrid } from './grid';
import { isMuted, setMuted } from './audio';
import { SCALES, type ResolveContext, type ScaleId } from './scales';
import { clampDay } from './time';
import { t } from './i18n';

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

const pad2Local = (n: number) => String(n).padStart(2, '0');

/**
 * セル idx に対応する「具体的な calendar 日時範囲」を返す。
 * NOW/countdown モード (calendar anchored grid) と custom モード (anniversary anchored
 * for month/year) を内部で分岐する。speed≠1 では sec/min/hour scale の cycle 境界が
 * ずれるが、tooltip は speed=1 想定の近似で描く (実用上問題なし)。
 */
function cellToWallRange(
  scale: ScaleId,
  idx: number,
  wallMs: number,
  ctx?: ResolveContext,
): string {
  const wall = new Date(wallMs);
  if (scale === 'year') {
    if (ctx?.originMode === 'custom' && ctx.originMs != null) {
      // anniversary-anchored: cycle 開始は origin の MM 月。cell idx → 開始月 + idx
      const origin = new Date(ctx.originMs);
      const oMo = origin.getMonth();
      const oDay = origin.getDate();
      // 直近 yearly anniversary を計算
      let anchorY = wall.getFullYear();
      const anchorD = clampDay(anchorY, oMo, oDay);
      let anchorMs = new Date(anchorY, oMo, anchorD).getTime();
      if (anchorMs > wallMs) {
        anchorY -= 1;
      }
      const cellMo = (oMo + idx) % 12;
      const cellY = anchorY + Math.floor((oMo + idx) / 12);
      return `${cellY} · ${MONTHS[cellMo]}`;
    }
    // calendar-anchored: 当年 idx 月
    return `${wall.getFullYear()} · ${MONTHS[idx]}`;
  }
  if (scale === 'month') {
    if (ctx?.originMode === 'custom' && ctx.originMs != null) {
      // anniversary-anchored: 直近月命日 + idx 日
      const origin = new Date(ctx.originMs);
      const oDay = origin.getDate();
      let anchorY = wall.getFullYear();
      let anchorMo = wall.getMonth();
      let anchorD = clampDay(anchorY, anchorMo, oDay);
      let anchorMs = new Date(anchorY, anchorMo, anchorD).getTime();
      if (anchorMs > wallMs) {
        anchorMo -= 1;
        if (anchorMo < 0) { anchorMo = 11; anchorY -= 1; }
        anchorD = clampDay(anchorY, anchorMo, oDay);
        anchorMs = new Date(anchorY, anchorMo, anchorD).getTime();
      }
      const cellDate = new Date(anchorMs);
      cellDate.setDate(cellDate.getDate() + idx);
      return `${cellDate.getFullYear()}/${pad2Local(cellDate.getMonth() + 1)}/${pad2Local(cellDate.getDate())}`;
    }
    // calendar-anchored: 当月 (idx+1) 日
    return `${wall.getFullYear()}/${pad2Local(wall.getMonth() + 1)}/${pad2Local(idx + 1)}`;
  }
  if (scale === 'day') {
    // cells = 当日の hours。idx 時 (24h 表記)
    return `${pad2Local(idx)}:00 — ${pad2Local(idx)}:59:59`;
  }
  if (scale === 'hour') {
    // cells = 当時間内の minutes。HH:idx:00 - HH:idx:59 (HH = 壁時計現在時間)
    const hh = pad2Local(wall.getHours());
    return `${hh}:${pad2Local(idx)}:00 — ${hh}:${pad2Local(idx)}:59`;
  }
  // minute scale: cells = 当分内の seconds。HH:MM:idx (HH:MM = 壁時計現在時分)
  return `${pad2Local(wall.getHours())}:${pad2Local(wall.getMinutes())}:${pad2Local(idx)}`;
}

/** 右下のサウンド ON/OFF インジケータ DOM。クリックで toggle。 */
export function setupSoundIndicator(): { refresh: () => void } {
  const el = document.createElement('button');
  el.className = 'sound-indicator';
  el.type = 'button';
  el.title = t('sound.tooltip');
  el.setAttribute('aria-label', t('sound.aria'));
  document.body.appendChild(el);
  const refresh = () => {
    el.textContent = isMuted() ? '♪ MUTED' : '♪ ON';
    el.classList.toggle('on', !isMuted());
    el.setAttribute('aria-pressed', isMuted() ? 'false' : 'true');
  };
  refresh();
  el.addEventListener('click', () => {
    setMuted(!isMuted());
    refresh();
  });
  return { refresh };
}

/**
 * マスホバーで時刻範囲ツールチップ。getCurrentScale で現スケールを取得。
 * 全 scale で wall-clock anchored の表示に統一。custom origin 時、month/year は
 * anniversary 起点の日付に切り替え (grid と同じ anchor を維持)。
 */
export function setupHoverTooltip(
  canvas: HTMLCanvasElement,
  grid: TimeGrid,
  getCurrentScale: () => ScaleId,
  getCtx: () => ResolveContext | undefined,
): void {
  const tooltip = document.createElement('div');
  tooltip.className = 'cell-tooltip';
  document.body.appendChild(tooltip);

  canvas.addEventListener('pointermove', (e) => {
    const idx = grid.hitTest(e.clientX, e.clientY);
    if (idx < 0) {
      tooltip.classList.remove('show');
      return;
    }
    const scale = getCurrentScale();
    const unit = SCALES[scale].unit;
    const timeRange = cellToWallRange(scale, idx, Date.now(), getCtx());
    // cell 番号は 1-indexed で表示 (1s..60s / 1m..60m / 1h..24h / 1d..31d / 1M..12M)
    tooltip.textContent = `${idx + 1}${unit}  ·  ${timeRange}`;
    tooltip.style.left = `${e.clientX + 14}px`;
    tooltip.style.top = `${e.clientY + 14}px`;
    tooltip.classList.add('show');
  });
  canvas.addEventListener('pointerleave', () => {
    tooltip.classList.remove('show');
  });
}

/** R6 マウス追随視差: canvas が pointer 位置に応じて ±6px シフト。
 *  pointer:coarse (タッチデバイス) では何もしない。 */
export function setupMouseParallax(canvas: HTMLCanvasElement): void {
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  if (isCoarse) return;
  window.addEventListener(
    'pointermove',
    (e) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      canvas.style.transform = `translate3d(${nx * 6}px, ${ny * 4}px, 0)`;
    },
    { passive: true },
  );
}
