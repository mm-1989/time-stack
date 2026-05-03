import './style.css';
import { VirtualClock, elapsedSinceJstMidnight, formatJstClock } from './time';
import { TimeGrid } from './grid';
import { Hud } from './hud';
import { SCALES, filledFor, type ScaleId } from './scales';
import { ScaleSwitch } from './scaleSwitch';
import { MiniGrid } from './miniGrid';
import { makePromotion } from './promotion';
import {
  playTick, playChime, playPromote, setMuted, isMuted, warmupAudio,
} from './audio';
import { InitScreen } from './initScreen';
import {
  parseOriginFromUrl, initialMsForOrigin, formatDateForUrl, type Origin,
} from './origin';
import { setupKonami, showEasterEggMessage } from './easterEgg';
import { maybeRunAudioTest, setupPromotionDebug, setupAudioDebug } from './debug';
import { setupSoundIndicator, setupHoverTooltip, setupMouseParallax } from './widgets';

// ===== 1. URL パラメータ・起動定数 =====
const params = new URL(location.href).searchParams;
const speed = Math.max(0.1, parseFloat(params.get('speed') ?? '1'));
const animSlow = Math.max(0.1, parseFloat(params.get('animSlow') ?? '1'));
const resetStart = params.has('reset');
const debug = params.get('debug');

// PWA: 本番ビルド (import.meta.env.PROD) のときだけ Service Worker を登録。
// dev 環境では SW を登録しない (localhost SW hijack を構造的に回避、
// feedback_localhost_sw_hijack.md の教訓)。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      /* SW 登録失敗は無視 (=非対応ブラウザ等) */
    });
  });
}

// ?audioTest=1 のときは通常 UI 起動を skip して 3 秒の WAV だけ合成
if (maybeRunAudioTest(params)) {
  // bootstrap は呼ばない (early exit)
} else {
  initApp();
}

function initApp(): void {
  // ===== 2. DOM canvas =====
  const app = document.querySelector<HTMLDivElement>('#app');
  if (!app) throw new Error('missing #app');
  const canvas = document.createElement('canvas');
  canvas.className = 'time-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '時間グリッドのビジュアライザ');
  app.appendChild(canvas);

  // ===== 3. 状態 =====
  let clock: VirtualClock | undefined;
  let activeOrigin: Origin | undefined;
  let progressiveUnlock = false;
  let prevCycleBucket = -1;
  let prevDayBucket = -1;
  let prevFilledFloor = -1;
  let lastVirtualMs = 0;
  let introKicked = false;

  // 初期スケール ('minute' デフォルト、?scale= で上書き可)
  let currentScaleId: ScaleId = (params.get('scale') as ScaleId) ?? 'minute';
  if (!(currentScaleId in SCALES)) currentScaleId = 'minute';

  // ===== 4. スケール階層 + コンポーネント =====
  const PROMOTE_TARGET: Record<ScaleId, ScaleId | null> = {
    minute: 'hour',
    hour: 'day',
    day: null,
  };

  const grid = new TimeGrid(canvas, scaleToGridOpts(currentScaleId));
  grid.setAnimSlow(animSlow);
  const hud = new Hud(document.body);
  const miniGrid = new MiniGrid(document.body);
  const scaleSwitch = new ScaleSwitch(document.body, currentScaleId, changeScale);
  syncMiniScale();

  // ===== 5. ヘルパー =====
  function scaleToGridOpts(id: ScaleId) {
    const s = SCALES[id];
    return {
      count: s.count,
      scaleLabel: s.label,
      fillColor: s.fillColor,
      subdivisions: s.subdivisions,
      unit: s.unit,
    };
  }

  function changeScale(newId: ScaleId): void {
    currentScaleId = newId;
    grid.transitionTo(scaleToGridOpts(newId), performance.now());
    prevCycleBucket = -1;
    syncMiniScale();
  }

  function syncMiniScale(): void {
    miniGrid.setScale(PROMOTE_TARGET[currentScaleId]);
  }

  function fitCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    grid.setSize(window.innerWidth, window.innerHeight, dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  function startPromotion(targetId: ScaleId, startTime: number): void {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const cssCx = window.innerWidth / 2;
    const cssCy = window.innerHeight / 2;
    grid.triggerPromotion(makePromotion({
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
    }));
  }

  function showUnlockMessage(label: string): void {
    const msg = document.createElement('div');
    msg.className = 'tron-message';
    msg.textContent = `> NEW SCALE: ${label}`;
    document.body.appendChild(msg);
    setTimeout(() => msg.classList.add('show'), 30);
    setTimeout(() => msg.classList.remove('show'), 2200);
    setTimeout(() => msg.remove(), 3000);
  }

  // ===== 6. 周辺 widgets (sound / tooltip / parallax) =====
  const soundIndicator = setupSoundIndicator();
  setupHoverTooltip(canvas, grid, () => currentScaleId, () => lastVirtualMs);
  setupMouseParallax(canvas);

  const pausedEl = document.getElementById('paused-overlay');

  // ===== 7. キーボードハンドラ =====
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyS') {
      setMuted(!isMuted());
      soundIndicator.refresh();
      return;
    }
    if (!clock) return; // bootstrap 中は時計関連を無視
    if (e.code === 'Space') {
      e.preventDefault();
      clock.toggleFreeze();
      pausedEl?.classList.toggle('show', clock.frozen);
    }
  });

  // iOS Safari 保険: 最初のクリック/キー入力で AudioContext を起こす
  const oneShotWarmup = () => {
    warmupAudio();
    window.removeEventListener('pointerdown', oneShotWarmup);
    window.removeEventListener('keydown', oneShotWarmup);
  };
  window.addEventListener('pointerdown', oneShotWarmup, { once: true });
  window.addEventListener('keydown', oneShotWarmup, { once: true });

  // Easter egg
  setupKonami(() => {
    showEasterEggMessage();
    const now = performance.now();
    for (let i = 0; i < 3; i++) {
      const target: ScaleId = (['hour', 'day', 'minute'] as ScaleId[])[i];
      setTimeout(() => startPromotion(target, performance.now()), 200 + i * 250);
    }
    grid.kickIntro(now);
  });

  // Shift+Click でデバッグ時刻ジャンプ
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

  // ===== 8. デバッグモード =====
  if (debug === 'promotion') {
    const targetId = PROMOTE_TARGET[currentScaleId];
    if (targetId) {
      setupPromotionDebug(hud, grid, scaleSwitch, () => startPromotion(targetId, performance.now()));
    }
  }
  if (debug === 'audio') {
    setupAudioDebug(hud);
  }

  // ===== 9. 周期境界 + マス完了の検出 =====
  function checkBoundaries(virtualMs: number, now: number): void {
    const period = SCALES[currentScaleId].periodMs;
    const cycleBucket = Math.floor(virtualMs / period);
    const dayBucket = Math.floor(virtualMs / 86_400_000);
    if (prevCycleBucket >= 0 && cycleBucket > prevCycleBucket) {
      grid.triggerHourBoundary(now);
      playChime();
      const targetId = PROMOTE_TARGET[currentScaleId];
      if (targetId) {
        startPromotion(targetId, now + 1300 * animSlow);
        setTimeout(() => playPromote(), 1300 * animSlow);
      }
    }
    if (prevDayBucket >= 0 && dayBucket > prevDayBucket) {
      grid.triggerDayBoundary(now);
    }
    prevCycleBucket = cycleBucket;
    prevDayBucket = dayBucket;
  }

  const isCoarseDevice = window.matchMedia('(pointer: coarse)').matches;
  function checkCellComplete(filled: number): void {
    const intFilled = Math.floor(filled);
    if (prevFilledFloor >= 0 && intFilled > prevFilledFloor) {
      const targetId = PROMOTE_TARGET[currentScaleId];
      if (targetId) scaleSwitch.microPulse(targetId);
      playTick();
      if (isCoarseDevice && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15);
      }
    }
    prevFilledFloor = intFilled;
  }

  // ===== 10. タイトル同期 + tick =====
  let lastTitleSec = -1;
  function maybeUpdateTitle(): void {
    const wallSec = Math.floor(elapsedSinceJstMidnight(Date.now()) / 1000);
    if (wallSec === lastTitleSec) return;
    lastTitleSec = wallSec;
    document.title = `${formatJstClock(Date.now())} · time-stack`;
  }

  function tick(now: number): void {
    if (!clock) return;
    if (!introKicked) {
      grid.kickIntro(now);
      introKicked = true;
    }
    const virtualMs = clock.tick(now);
    lastVirtualMs = virtualMs;
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
    scaleSwitch.updateProgress({
      minute: filledFor(SCALES.minute, virtualMs) / SCALES.minute.count,
      hour: filledFor(SCALES.hour, virtualMs) / SCALES.hour.count,
      day: filledFor(SCALES.day, virtualMs) / SCALES.day.count,
    });
    const upperId = PROMOTE_TARGET[currentScaleId];
    if (upperId) miniGrid.setFilled(filledFor(SCALES[upperId], virtualMs));
    grid.render(now);
    hud.update(virtualMs, speed, clock.frozen);
    if (activeOrigin?.mode === 'countdown') {
      hud.setCountdown(activeOrigin.date);
    }
    maybeUpdateTitle();
    requestAnimationFrame(tick);
  }

  // ===== 11. 起動シーケンス =====
  async function bootstrap(): Promise<void> {
    let origin: Origin;
    const urlOrigin = parseOriginFromUrl(new URL(location.href));
    if (urlOrigin) {
      origin = urlOrigin;
    } else {
      const init = new InitScreen(document.body);
      origin = await init.show();
      warmupAudio(); // BEGIN クリックの user gesture で AudioContext を resume
      const u = new URL(location.href);
      if (origin.mode === 'custom') {
        u.searchParams.set('since', formatDateForUrl(origin.date));
        window.history.replaceState({}, '', u);
      } else if (origin.mode === 'countdown') {
        u.searchParams.set('until', formatDateForUrl(origin.date));
        window.history.replaceState({}, '', u);
      }
    }
    activeOrigin = origin;
    start(origin);
  }

  function start(origin: Origin): void {
    const initialVirtualMs = resetStart ? 0 : initialMsForOrigin(origin, Date.now());
    clock = new VirtualClock(speed, performance.now(), initialVirtualMs);

    const unlockAll = params.get('unlock') === 'all';
    progressiveUnlock = origin.mode === 'now' && !unlockAll;
    scaleSwitch.setUnlocked('minute', true);
    scaleSwitch.setUnlocked('hour', !progressiveUnlock);
    scaleSwitch.setUnlocked('day', !progressiveUnlock);
    if (progressiveUnlock && currentScaleId !== 'minute') {
      currentScaleId = 'minute';
      grid.transitionTo(scaleToGridOpts('minute'), performance.now());
      syncMiniScale();
    }

    const initEl = document.getElementById('init-overlay');
    if (initEl) setTimeout(() => initEl.classList.add('gone'), 1500);
    warmupAudio();
    requestAnimationFrame(tick);
  }

  bootstrap();
}
