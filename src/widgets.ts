// 周辺 DOM ウィジェット (sound-indicator, hover tooltip, mouse parallax) のセットアップ。
// メインロジックから切り離して main.ts を軽量化する。

import type { TimeGrid } from './grid';
import { isMuted, setMuted } from './audio';
import { SCALES, type ScaleId } from './scales';
import { t } from './i18n';

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

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

/** マスホバーで時刻範囲ツールチップ。getCurrentScale で現スケールを取得。 */
export function setupHoverTooltip(
  canvas: HTMLCanvasElement,
  grid: TimeGrid,
  getCurrentScale: () => ScaleId,
  getVirtualMs: () => number,
): void {
  const tooltip = document.createElement('div');
  tooltip.className = 'cell-tooltip';
  document.body.appendChild(tooltip);
  const pad2 = (n: number) => String(n).padStart(2, '0');

  canvas.addEventListener('pointermove', (e) => {
    const idx = grid.hitTest(e.clientX, e.clientY);
    if (idx < 0) {
      tooltip.classList.remove('show');
      return;
    }
    const scale = getCurrentScale();
    const unit = SCALES[scale].unit;
    const totalSec = Math.floor(getVirtualMs() / 1000);
    const hour = Math.floor(totalSec / 3600) % 24;
    const min = Math.floor(totalSec / 60) % 60;
    const wallNow = new Date();
    let timeRange: string;
    if (scale === 'year') {
      // idx 0..11 = 1月..12月。当該月の開始月-終了月を表示
      const monthName = MONTHS[idx] ?? `M${idx + 1}`;
      timeRange = `${wallNow.getFullYear()} · ${monthName}`;
    } else if (scale === 'month') {
      // idx は当月 N 日目 (0-indexed)。日付の壁時計表示
      const yyyy = wallNow.getFullYear();
      const mm = pad2(wallNow.getMonth() + 1);
      const dd = pad2(idx + 1);
      timeRange = `${yyyy}/${mm}/${dd}`;
    } else if (scale === 'day') {
      timeRange = `${pad2(idx)}:00 — ${pad2(idx)}:59:59`;
    } else if (scale === 'hour') {
      timeRange = `${pad2(hour)}:${pad2(idx)}:00 — ${pad2(hour)}:${pad2(idx)}:59`;
    } else {
      timeRange = `${pad2(hour)}:${pad2(min)}:${pad2(idx)}`;
    }
    // cell 番号は 1-indexed で表示 (1s..60s / 1m..60m / 1h..24h / 1d..31d / 1M..12M)。
    // 内部の idx は 0-indexed のままで、表示時のみ +1 する。
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
