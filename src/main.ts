import './style.css';
import { VirtualClock, elapsedSinceJstMidnight, formatJstClock } from './time';
import { TimeGrid } from './grid';
import { Hud } from './hud';
import { SCALES, filledFor, type ScaleId } from './scales';
import { ScaleSwitch } from './scaleSwitch';
import { MiniGrid } from './miniGrid';
import { makePromotion } from './promotion';
import { playTick, playChime, playPromote, setMuted, isMuted } from './audio';
import { InitScreen } from './initScreen';
import { parseOriginFromUrl, initialMsForOrigin, formatDateForUrl, type Origin } from './origin';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const canvas = document.createElement('canvas');
canvas.className = 'time-canvas';
app.appendChild(canvas);

const params = new URL(location.href).searchParams;
const speed = Math.max(0.1, parseFloat(params.get('speed') ?? '1'));
// アニメ全体のスローモー倍率。?animSlow=4 で全演出が 4 倍ゆっくり。
const animSlow = Math.max(0.1, parseFloat(params.get('animSlow') ?? '1'));
// 起点モード: ?since=YYYY-MM-DD があればそれを採用。?reset=now-only-bypass 用。
const resetStart = params.has('reset');

// 起動: URL に ?since があれば直接、なければ InitScreen で起点を選ばせる。
async function bootstrap(): Promise<void> {
  let origin: Origin;
  const urlOrigin = parseOriginFromUrl(new URL(location.href));
  if (urlOrigin) {
    origin = urlOrigin;
  } else {
    const init = new InitScreen(document.body);
    origin = await init.show();
    if (origin.mode === 'custom') {
      // 選択結果を URL に反映 (リロードや共有しても同じ起点)
      const u = new URL(location.href);
      u.searchParams.set('since', formatDateForUrl(origin.date));
      window.history.replaceState({}, '', u);
    }
  }
  start(origin);
}

let clock: VirtualClock | undefined;
// progressive unlock モード: NOW モード + ?unlock=all なし のとき有効
let progressiveUnlock = false;

function start(origin: Origin): void {
  const initialVirtualMs = resetStart ? 0 : initialMsForOrigin(origin, Date.now());
  clock = new VirtualClock(speed, performance.now(), initialVirtualMs);

  // unlock 状態の初期化:
  //   ?unlock=all (capture 用) or CUSTOM 起点なら全部 unlocked
  //   NOW 起点なら progressive (minute だけ unlocked)
  const unlockAll = params.get('unlock') === 'all';
  progressiveUnlock = origin.mode === 'now' && !unlockAll;
  scaleSwitch.setUnlocked('minute', true);
  scaleSwitch.setUnlocked('hour', !progressiveUnlock);
  scaleSwitch.setUnlocked('day', !progressiveUnlock);
  // progressive で起動した場合、初期スケールが未アンロックなら強制で minute へ
  if (progressiveUnlock && currentScaleId !== 'minute') {
    currentScaleId = 'minute';
    grid.transitionTo(scaleToGridOpts('minute'), performance.now());
    syncMiniScale();
  }

  const initEl = document.getElementById('init-overlay');
  if (initEl) setTimeout(() => initEl.classList.add('gone'), 1500);
  requestAnimationFrame(tick);
}

/** スケールアンロック演出: 中央に「> NEW SCALE: X」を 2 秒表示 */
function showUnlockMessage(label: string): void {
  const msg = document.createElement('div');
  msg.className = 'tron-message';
  msg.textContent = `> NEW SCALE: ${label}`;
  document.body.appendChild(msg);
  setTimeout(() => msg.classList.add('show'), 30);
  setTimeout(() => msg.classList.remove('show'), 2200);
  setTimeout(() => msg.remove(), 3000);
}

// 初期表示は minute モード (1 秒で 1 マス動くので開始時から動きが見える)
let currentScaleId: ScaleId = (params.get('scale') as ScaleId) ?? 'minute';
if (!(currentScaleId in SCALES)) currentScaleId = 'minute';

const grid = new TimeGrid(canvas, scaleToGridOpts(currentScaleId));
grid.setAnimSlow(animSlow);
const hud = new Hud(document.body);
const miniGrid = new MiniGrid(document.body);

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

// スケール切替は常に 1 段階で直接。中間スケール経由はもったり感の原因のため撤去。
function changeScale(newId: ScaleId): void {
  currentScaleId = newId;
  grid.transitionTo(scaleToGridOpts(newId), performance.now());
  prevCycleBucket = -1;
  syncMiniScale();
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

// freeze 状態の PAUSED オーバーレイ
const pausedEl = document.getElementById('paused-overlay');

// サウンド toggle インジケータ (右下、フッターの上)
const soundIndicator = document.createElement('div');
soundIndicator.className = 'sound-indicator';
soundIndicator.title = 'S キーでオンオフ';
document.body.appendChild(soundIndicator);
function refreshSoundIndicator(): void {
  soundIndicator.textContent = isMuted() ? '♪ MUTED' : '♪ ON';
  soundIndicator.classList.toggle('on', !isMuted());
}
refreshSoundIndicator();
soundIndicator.addEventListener('click', () => {
  setMuted(!isMuted());
  refreshSoundIndicator();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyS') {
    setMuted(!isMuted());
    refreshSoundIndicator();
    return;
  }
  if (!clock) return; // bootstrap (init 画面表示中) は時計関連を無視
  if (e.code === 'Space') {
    e.preventDefault();
    clock.toggleFreeze();
    pausedEl?.classList.toggle('show', clock.frozen);
  }
});

// R10 Easter Egg: Konami code で TRON 起動メッセージ + 全スケールへ promotion を一気に発火
const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'KeyB', 'KeyA',
];
let konamiBuf: string[] = [];
window.addEventListener('keydown', (e) => {
  konamiBuf.push(e.code);
  if (konamiBuf.length > KONAMI.length) konamiBuf.shift();
  if (konamiBuf.length === KONAMI.length && konamiBuf.every((k, i) => k === KONAMI[i])) {
    konamiBuf = [];
    triggerEasterEgg();
  }
});

function triggerEasterEgg(): void {
  // メッセージ overlay
  const msg = document.createElement('div');
  msg.className = 'tron-message';
  msg.textContent = '> IDENTITY DISC ACTIVATED';
  document.body.appendChild(msg);
  setTimeout(() => msg.classList.add('show'), 30);
  setTimeout(() => msg.classList.remove('show'), 2400);
  setTimeout(() => msg.remove(), 3200);

  // 全スケールへ順次 promotion 発火 (連鎖感)
  const now = performance.now();
  for (let i = 0; i < 3; i++) {
    const target: ScaleId = (['hour', 'day', 'minute'] as ScaleId[])[i];
    setTimeout(() => startPromotion(target, performance.now()), 200 + i * 250);
  }
  // grid を再展開
  grid.kickIntro(now);
}

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
    playChime();
    // 階層昇格フライト: collapse 完了 + afterglow と並行して、上位バッジへ飛ばす
    const targetId = PROMOTE_TARGET[currentScaleId];
    if (targetId) {
      startPromotion(targetId, now + 1300 * animSlow);
      // promotion 発射時に上昇音 (collapse 完了直後)
      setTimeout(() => playPromote(), 1300 * animSlow);
    }
  }
  if (prevDayBucket >= 0 && dayBucket > prevDayBucket) {
    grid.triggerDayBoundary(now);
  }
  prevCycleBucket = cycleBucket;
  prevDayBucket = dayBucket;
}

// 自スケール内の「マス完了」 = 上位スケールの「マス 1 個分前進」。
// 上位バッジを微かに脈動させ、軽い tick 音 + 触感を発火する (連鎖感)。
let prevFilledFloor = -1;
const isCoarseDevice = window.matchMedia('(pointer: coarse)').matches;
function checkCellComplete(filled: number): void {
  const intFilled = Math.floor(filled);
  if (prevFilledFloor >= 0 && intFilled > prevFilledFloor) {
    const targetId = PROMOTE_TARGET[currentScaleId];
    if (targetId) scaleSwitch.microPulse(targetId);
    playTick();
    // mobile/touch では軽い触感 (15ms)
    if (isCoarseDevice && typeof navigator.vibrate === 'function') {
      navigator.vibrate(15);
    }
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

// R6 マウス追随視差: canvas が pointer 位置に応じて微小シフト (立体感)。
// pointer:coarse (タッチデバイス) では無効。
const isCoarse = window.matchMedia('(pointer: coarse)').matches;
if (!isCoarse) {
  window.addEventListener(
    'pointermove',
    (e) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2; // -1..1
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      canvas.style.transform = `translate3d(${nx * 6}px, ${ny * 4}px, 0)`;
    },
    { passive: true },
  );
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

// デバッグ: Shift + マスクリックで時刻スキップ。通常クリックは無効。
canvas.addEventListener('click', (e) => {
  if (!e.shiftKey || !clock) return;
  const idx = grid.hitTest(e.clientX, e.clientY);
  if (idx < 0) return;
  const period = SCALES[currentScaleId].periodMs;
  const cellMs = SCALES[currentScaleId].msPerCell;
  const cyclesSoFar = Math.floor(lastVirtualMs / period);
  const newVirtualMs = cyclesSoFar * period + idx * cellMs;
  clock.setVirtualMs(newVirtualMs);
  prevFilledFloor = idx - 1;
  prevCycleBucket = Math.floor(newVirtualMs / period);
});

// 初回 tick で起動シネマ intro を発火 (mode='in' から開始)
let introKicked = false;

function tick(now: number): void {
  if (!clock) return; // 未初期化なら何もしない (起動時の安全弁)
  if (!introKicked) {
    grid.kickIntro(now);
    introKicked = true;
  }
  const virtualMs = clock.tick(now);
  lastVirtualMs = virtualMs;
  // progressive unlock: NOW モード時、virtualMs 経過で順次バッジが現れる
  if (progressiveUnlock) {
    if (virtualMs >= 60_000 && !scaleSwitch.isUnlocked('hour')) {
      scaleSwitch.setUnlocked('hour', true);
      showUnlockMessage('1 HOUR');
    }
    if (virtualMs >= 3_600_000 && !scaleSwitch.isUnlocked('day')) {
      scaleSwitch.setUnlocked('day', true);
      showUnlockMessage('1 DAY');
    }
  }

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

bootstrap(); // ← 起動: init 画面 (or URL ?since 直接) → start() → tick
