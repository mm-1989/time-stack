// 周辺 DOM ウィジェット (sound-indicator, hover tooltip, mouse parallax) のセットアップ。
// メインロジックから切り離して main.ts を軽量化する。

import type { TimeGrid } from './grid';
import { isMuted, setMuted } from './audio';
import { SCALES, type ScaleId } from './scales';

/** 右下のサウンド ON/OFF インジケータ DOM。クリックで toggle。 */
export function setupSoundIndicator(): { refresh: () => void } {
  const el = document.createElement('div');
  el.className = 'sound-indicator';
  el.title = 'S キーでオンオフ';
  document.body.appendChild(el);
  const refresh = () => {
    el.textContent = isMuted() ? '♪ MUTED' : '♪ ON';
    el.classList.toggle('on', !isMuted());
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
    let timeRange: string;
    if (scale === 'day') {
      timeRange = `${pad2(idx)}:00 — ${pad2(idx)}:59:59`;
    } else if (scale === 'hour') {
      timeRange = `${pad2(hour)}:${pad2(idx)}:00 — ${pad2(hour)}:${pad2(idx)}:59`;
    } else {
      timeRange = `${pad2(hour)}:${pad2(min)}:${pad2(idx)}`;
    }
    tooltip.textContent = `${idx}${unit}  ·  ${timeRange}`;
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
