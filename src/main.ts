import './style.css';
import { VirtualClock, elapsedSinceJstMidnight, formatJstClock } from './time';
import { TimeGrid } from './grid';
import { Hud } from './hud';
import { SCALES, filledFor, type ScaleId } from './scales';
import { ScaleSwitch } from './scaleSwitch';
import { MiniGrid } from './miniGrid';
import { makePromotion } from './promotion';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const canvas = document.createElement('canvas');
canvas.className = 'time-canvas';
app.appendChild(canvas);

const params = new URL(location.href).searchParams;
const speed = Math.max(0.1, parseFloat(params.get('speed') ?? '1'));
// アニメ全体のスローモー倍率。?animSlow=4 で全演出が 4 倍ゆっくり。
const animSlow = Math.max(0.1, parseFloat(params.get('animSlow') ?? '1'));
// 起点は JST 本日 0:00:00。今が JST 12:30 なら 12 時間 30 分経過済みでスタート。
// ?reset を付けると 0 から始まる (デバッグ用)。
const resetStart = params.has('reset');
const initialVirtualMs = resetStart ? 0 : elapsedSinceJstMidnight(Date.now());
const clock = new VirtualClock(speed, performance.now(), initialVirtualMs);

// 初期表示は minute モード (1 秒で 1 マス動くので開始時から動きが見える)
let currentScaleId: ScaleId = (params.get('scale') as ScaleId) ?? 'minute';
if (!(currentScaleId in SCALES)) currentScaleId = 'minute';

const grid = new TimeGrid(canvas, scaleToGridOpts(currentScaleId));
grid.setAnimSlow(animSlow);
const hud = new Hud(document.body);
const miniGrid = new MiniGrid(document.body);
const SCALE_INDEX: Record<ScaleId, number> = { minute: 0, hour: 1, day: 2 };
const SCALE_AT_INDEX: ScaleId[] = ['minute', 'hour', 'day'];

// スケール階層: 1 周期完了時にどのバッジへ promotion を飛ばすか
// (changeScale / syncMiniScale より前に宣言する。const は TDZ なので順序重要)
const PROMOTE_TARGET: Record<ScaleId, ScaleId | null> = {
  minute: 'hour',
  hour: 'day',
  day: null, // 上位なし
};

const scaleSwitch = new ScaleSwitch(document.body, currentScaleId, (id) => {
  changeScale(id);
});

// E: 段階的スケール遷移。minute ↔ day のような遠い切替では、中間スケール (hour)
// を経由して 2 段階で行う。階層の存在を体感できる。
function changeScale(newId: ScaleId): void {
  const oldIdx = SCALE_INDEX[currentScaleId];
  const newIdx = SCALE_INDEX[newId];
  const distance = Math.abs(newIdx - oldIdx);
  if (distance >= 2) {
    // 中間段階を経由 (oldIdx と newIdx の間のスケール)
    const midIdx = oldIdx < newIdx ? oldIdx + 1 : oldIdx - 1;
    const midId = SCALE_AT_INDEX[midIdx];
    currentScaleId = midId;
    grid.transitionTo(scaleToGridOpts(midId), performance.now());
    prevCycleBucket = -1;
    syncMiniScale();
    // 1 段階目完了後 (OUT 380 + IN 520 + stagger ≈ 1100ms) に最終へ
    window.setTimeout(() => {
      currentScaleId = newId;
      grid.transitionTo(scaleToGridOpts(newId), performance.now());
      prevCycleBucket = -1;
      syncMiniScale();
    }, 1100 * animSlow);
  } else {
    currentScaleId = newId;
    grid.transitionTo(scaleToGridOpts(newId), performance.now());
    prevCycleBucket = -1;
    syncMiniScale();
  }
}

function syncMiniScale(): void {
  miniGrid.setScale(PROMOTE_TARGET[currentScaleId]);
}
syncMiniScale();

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
    duration: 800 * animSlow,
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
    if (targetId) startPromotion(targetId, now + 1300 * animSlow); // collapse 完了直後に発射
  }
  if (prevDayBucket >= 0 && dayBucket > prevDayBucket) {
    grid.triggerDayBoundary(now);
  }
  prevCycleBucket = cycleBucket;
  prevDayBucket = dayBucket;
}

// 自スケール内の「マス完了」 = 上位スケールの「マス 1 個分前進」。
// 上位バッジを微かに脈動させて連鎖感を出す。
let prevFilledFloor = -1;
function checkCellComplete(filled: number): void {
  const intFilled = Math.floor(filled);
  if (prevFilledFloor >= 0 && intFilled > prevFilledFloor) {
    const targetId = PROMOTE_TARGET[currentScaleId];
    if (targetId) scaleSwitch.microPulse(targetId);
  }
  prevFilledFloor = intFilled;
}

// デバッグ: ?debug=promotion で起動 200ms 後に promotion を強制発火 (キャプチャ用)
// 発射タイミングは固定。飛行 duration のみ animSlow を反映するので、wait を長めに取れば
// 確実に飛行中盤を撮影できる。
const debug = params.get('debug');
if (debug === 'promotion') {
  const targetId = PROMOTE_TARGET[currentScaleId];
  if (targetId) {
    setTimeout(() => {
      startPromotion(targetId, performance.now());
      // 観測ヘルパー: HUD に「flight 件数」と発射時刻を表示
      hud.setDebug(`promotion fired @ ${Math.round(performance.now())}ms`);
    }, 200);
  }
}

// デバッグ: ?debug=promotion 時、毎フレーム grid.promotions の数を HUD に表示
if (debug === 'promotion') {
  setInterval(() => {
    const n = grid.activePromotionCount;
    const t = scaleSwitch.getButtonCenter('hour');
    hud.setDebug(
      `flights=${n}` +
        (t ? ` target=(${Math.round(t.x)},${Math.round(t.y)})` : ' target=null'),
    );
  }, 100);
}

// ホバーツールチップ: マスにマウスを当てるとそのマスが代表する時刻範囲を表示
const tooltipEl = document.createElement('div');
tooltipEl.className = 'cell-tooltip';
document.body.appendChild(tooltipEl);

let lastVirtualMs = 0;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function buildTooltipText(idx: number): string {
  const unit = SCALES[currentScaleId].unit;
  const totalSec = Math.floor(lastVirtualMs / 1000);
  const hour = Math.floor(totalSec / 3600) % 24;
  const min = Math.floor(totalSec / 60) % 60;
  let timeRange: string;
  if (currentScaleId === 'day') {
    timeRange = `${pad2(idx)}:00 — ${pad2(idx)}:59:59`;
  } else if (currentScaleId === 'hour') {
    timeRange = `${pad2(hour)}:${pad2(idx)}:00 — ${pad2(hour)}:${pad2(idx)}:59`;
  } else {
    timeRange = `${pad2(hour)}:${pad2(min)}:${pad2(idx)}`;
  }
  return `${idx}${unit}  ·  ${timeRange}`;
}

canvas.addEventListener('pointermove', (e) => {
  const idx = grid.hitTest(e.clientX, e.clientY);
  if (idx < 0) {
    tooltipEl.classList.remove('show');
    return;
  }
  tooltipEl.textContent = buildTooltipText(idx);
  tooltipEl.style.left = `${e.clientX + 14}px`;
  tooltipEl.style.top = `${e.clientY + 14}px`;
  tooltipEl.classList.add('show');
});
canvas.addEventListener('pointerleave', () => {
  tooltipEl.classList.remove('show');
});

// 初回 tick で起動シネマ intro を発火 (mode='in' から開始)
let introKicked = false;

function tick(now: number): void {
  if (!introKicked) {
    grid.kickIntro(now);
    introKicked = true;
  }
  const virtualMs = clock.tick(now);
  lastVirtualMs = virtualMs;
  const filled = filledFor(SCALES[currentScaleId], virtualMs);
  grid.setFilled(filled, now);
  checkBoundaries(virtualMs, now);
  checkCellComplete(filled);
  // 各バッジ進捗バーを更新 (B 案)。3 スケール独立に「自スケール内の進捗」を出す。
  scaleSwitch.updateProgress({
    minute: filledFor(SCALES.minute, virtualMs) / SCALES.minute.count,
    hour: filledFor(SCALES.hour, virtualMs) / SCALES.hour.count,
    day: filledFor(SCALES.day, virtualMs) / SCALES.day.count,
  });
  // ミニ上位ビュー更新 (A 案)
  const upperId = PROMOTE_TARGET[currentScaleId];
  if (upperId) {
    miniGrid.setFilled(filledFor(SCALES[upperId], virtualMs));
  }
  grid.render(now);
  hud.update(virtualMs, speed, clock.frozen);
  maybeUpdateTitle();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
