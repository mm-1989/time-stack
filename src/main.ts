import './style.css';
import { VirtualClock, elapsedSinceJstMidnight, formatJstClock } from './time';
import { TimeGrid } from './grid';
import { Hud } from './hud';
import { SCALES, filledFor, type ScaleId } from './scales';
import { ScaleSwitch } from './scaleSwitch';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const canvas = document.createElement('canvas');
canvas.className = 'time-canvas';
app.appendChild(canvas);

const speed = Math.max(0.1, parseFloat(new URL(location.href).searchParams.get('speed') ?? '1'));
// 起点は JST 本日 0:00:00。今が JST 12:30 なら 12 時間 30 分経過済みでスタート。
// ?reset を付けると 0 から始まる (デバッグ用)。
const resetStart = new URL(location.href).searchParams.has('reset');
const initialVirtualMs = resetStart ? 0 : elapsedSinceJstMidnight(Date.now());
const clock = new VirtualClock(speed, performance.now(), initialVirtualMs);

let currentScaleId: ScaleId = (new URL(location.href).searchParams.get('scale') as ScaleId) ?? 'day';
if (!(currentScaleId in SCALES)) currentScaleId = 'day';

const grid = new TimeGrid(canvas, scaleToGridOpts(currentScaleId));
const hud = new Hud(document.body);
new ScaleSwitch(document.body, currentScaleId, (id) => {
  currentScaleId = id;
  grid.transitionTo(scaleToGridOpts(id), performance.now());
});

function scaleToGridOpts(id: ScaleId): {
  count: number;
  scaleLabel: string;
  fillColor: string;
  subdivisions: number;
  unit: string;
} {
  const s = SCALES[id];
  return {
    count: s.count,
    scaleLabel: s.label,
    fillColor: s.fillColor,
    subdivisions: s.subdivisions,
    unit: s.unit,
  };
}

function fitCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio, 2);
  grid.setSize(window.innerWidth, window.innerHeight, dpr);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    clock.toggleFreeze();
  }
});

// タイトルバー同期: 1 秒に 1 回だけ document.title を更新 (タブが時計として機能)
let lastTitleSec = -1;
function maybeUpdateTitle(): void {
  const wallSec = Math.floor(elapsedSinceJstMidnight(Date.now()) / 1000);
  if (wallSec === lastTitleSec) return;
  lastTitleSec = wallSec;
  document.title = `${formatJstClock(Date.now())} · time-stack`;
}

// 時刻境界 (1 時間 / 1 日) を virtualMs ベースで検出して grid に通知
let prevHourBucket = -1;
let prevDayBucket = -1;
function checkBoundaries(virtualMs: number, now: number): void {
  const hourBucket = Math.floor(virtualMs / 3_600_000);
  const dayBucket = Math.floor(virtualMs / 86_400_000);
  if (prevHourBucket >= 0 && hourBucket > prevHourBucket) {
    grid.triggerHourBoundary(now);
  }
  if (prevDayBucket >= 0 && dayBucket > prevDayBucket) {
    grid.triggerDayBoundary(now);
  }
  prevHourBucket = hourBucket;
  prevDayBucket = dayBucket;
}

function tick(now: number): void {
  const virtualMs = clock.tick(now);
  const filled = filledFor(SCALES[currentScaleId], virtualMs);
  grid.setFilled(filled, now);
  checkBoundaries(virtualMs, now);
  grid.render(now);
  hud.update(virtualMs, speed, clock.frozen);
  maybeUpdateTitle();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
