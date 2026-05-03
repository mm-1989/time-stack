import './style.css';
import { VirtualClock, elapsedSinceJstMidnight, formatJstClock } from './time';
import { TimeGrid } from './grid';
import { Hud } from './hud';
import { SCALES, filledFor, type ScaleId } from './scales';
import { ScaleSwitch } from './scaleSwitch';
import { makePromotion } from './promotion';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const canvas = document.createElement('canvas');
canvas.className = 'time-canvas';
app.appendChild(canvas);

const params = new URL(location.href).searchParams;
const speed = Math.max(0.1, parseFloat(params.get('speed') ?? '1'));
// 起点は JST 本日 0:00:00。今が JST 12:30 なら 12 時間 30 分経過済みでスタート。
// ?reset を付けると 0 から始まる (デバッグ用)。
const resetStart = params.has('reset');
const initialVirtualMs = resetStart ? 0 : elapsedSinceJstMidnight(Date.now());
const clock = new VirtualClock(speed, performance.now(), initialVirtualMs);

let currentScaleId: ScaleId = (params.get('scale') as ScaleId) ?? 'day';
if (!(currentScaleId in SCALES)) currentScaleId = 'day';

const grid = new TimeGrid(canvas, scaleToGridOpts(currentScaleId));
const hud = new Hud(document.body);
const scaleSwitch = new ScaleSwitch(document.body, currentScaleId, (id) => {
  currentScaleId = id;
  grid.transitionTo(scaleToGridOpts(id), performance.now());
  // スケール切替時に周期 bucket をリセットして、切替直後の擬発火を抑制
  prevCycleBucket = -1;
});

// スケール階層: 1 周期完了時にどのバッジへ promotion を飛ばすか
const PROMOTE_TARGET: Record<ScaleId, ScaleId | null> = {
  minute: 'hour',
  hour: 'day',
  day: null, // 上位なし
};

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

// 周期 bucket: 現スケールの「N 周期目」が増えるたびに collapse + promotion を発火する
let prevCycleBucket = -1;
let prevDayBucket = -1;

function startPromotion(targetId: ScaleId, startTime: number): void {
  const dpr = Math.min(window.devicePixelRatio, 2);
  const cssCx = window.innerWidth / 2;
  const cssCy = window.innerHeight / 2;
  const flight = makePromotion({
    startTime,
    startX: cssCx * dpr,
    startY: cssCy * dpr,
    getTargetCanvasXY: () => {
      const t = scaleSwitch.getButtonCenter(targetId);
      if (!t) return null;
      return { x: t.x * dpr, y: t.y * dpr };
    },
    onArrive: () => scaleSwitch.pulse(targetId),
    duration: 800,
  });
  grid.triggerPromotion(flight);
}

function checkBoundaries(virtualMs: number, now: number): void {
  const period = SCALES[currentScaleId].periodMs;
  const cycleBucket = Math.floor(virtualMs / period);
  const dayBucket = Math.floor(virtualMs / 86_400_000);
  if (prevCycleBucket >= 0 && cycleBucket > prevCycleBucket) {
    grid.triggerHourBoundary(now); // collapse 発火 (名前は legacy)
    // 階層昇格フライト: collapse 完了 + afterglow と並行して、上位バッジへ飛ばす
    const targetId = PROMOTE_TARGET[currentScaleId];
    if (targetId) startPromotion(targetId, now + 1300); // collapse 完了直後に発射
  }
  if (prevDayBucket >= 0 && dayBucket > prevDayBucket) {
    grid.triggerDayBoundary(now);
  }
  prevCycleBucket = cycleBucket;
  prevDayBucket = dayBucket;
}

// デバッグ: ?debug=promotion で起動 1.5 秒後に promotion を強制発火 (キャプチャ用)
const debug = params.get('debug');
if (debug === 'promotion') {
  const targetId = PROMOTE_TARGET[currentScaleId];
  if (targetId) {
    setTimeout(() => startPromotion(targetId, performance.now()), 1500);
  }
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
