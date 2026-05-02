import './style.css';
import * as THREE from 'three';
import { syncStack } from './stack';
import { Hud } from './hud';
import { Hourglass } from './hourglass';
import { createPostFx } from './postfx';
import { Background, Dust } from './environment';
import { CameraRig } from './camera';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.matchMedia('(max-width: 640px), (pointer: coarse)').matches;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 14);
camera.lookAt(0, 0, 0);

const cameraRig = new CameraRig(camera, {
  baseRadius: isMobile ? 10.5 : 9,
  introRadius: 14,
  introDurationMs: reducedMotion ? 0 : 2400,
  target: new THREE.Vector3(0, 0, 0),
  driftScale: reducedMotion ? 0 : 1,
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
// モバイルでは DPR 1.5 まで、デスクトップは 2 まで (post-processing 負荷軽減)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const background = new Background();
scene.add(background.mesh);

// reduced-motion ではダストを大幅減 + 動かさない、モバイルでは個数半減
const dustCount = reducedMotion ? 80 : isMobile ? 180 : 360;
const dust = new Dust(dustCount);
scene.add(dust.points);

scene.add(new THREE.AmbientLight(0xffffff, 0.42));
const keyLight = new THREE.DirectionalLight(0xfff0d8, 0.85);
keyLight.position.set(3, 6, 4);
scene.add(keyLight);
// リムライト: 後方斜め下から、シルエットを浮き立たせる冷たい光
const rimLight = new THREE.DirectionalLight(0x6a90c8, 0.55);
rimLight.position.set(-2, -1.5, -3);
scene.add(rimLight);
// フィルライト: 反対側から弱く
const fillLight = new THREE.DirectionalLight(0xb0c8e0, 0.18);
fillLight.position.set(-3, 2, 4);
scene.add(fillLight);

const hourglass = new Hourglass({
  origin: new THREE.Vector3(0, 0, 0),
  height: 2.0,
  rimRadius: 1.4,
  scene,
});
scene.add(hourglass.group);

const postfx = createPostFx(renderer, scene, camera);
// モバイルでは bloom 強度を控えめに (パフォーマンス + 過剰発光の抑制)
if (isMobile) postfx.bloom.strength = 0.55;
cameraRig.attachPointer(renderer.domElement);

const hud = new Hud(document.body);
const speed = Math.max(0.1, parseFloat(new URL(location.href).searchParams.get('speed') ?? '1'));

let virtualMs = 0;
let lastFrameNow = performance.now();
let frozen = false;

const SKIP_WINDOW_MS = 300;
let skipCount = 0;
let skipTimer: number | null = null;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    frozen = !frozen;
    return;
  }
  if (e.code === 'ArrowRight') {
    e.preventDefault();
    skipCount++;
    if (skipTimer !== null) window.clearTimeout(skipTimer);
    skipTimer = window.setTimeout(() => {
      const addSec = skipCount === 1 ? 60 : skipCount === 2 ? 600 : 3600;
      virtualMs += addSec * 1000;
      skipCount = 0;
      skipTimer = null;
    }, SKIP_WINDOW_MS);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.resize(window.innerWidth, window.innerHeight, renderer.getPixelRatio());
});

let prevMin = -1;
let prevHour = -1;
let prevDay = -1;
let initialized = false;

function tick(now: number) {
  const delta = now - lastFrameNow;
  lastFrameNow = now;
  const deltaSec = delta * 0.001;
  if (!frozen) virtualMs += delta * speed;

  const virtualSec = Math.floor(virtualMs / 1000);
  const sec = virtualSec % 60;
  const min = Math.floor(virtualSec / 60) % 60;
  const hour = Math.floor(virtualSec / 3600) % 24;
  const day = Math.floor(virtualSec / 86400);
  const hourFloat = (virtualMs / 3600000) % 24;

  if (initialized && !hourglass.isFlipping) {
    if (day !== prevDay) {
      hourglass.startFlip(now);
      cameraRig.triggerFlip(now, 1500);
    } else if (hour !== prevHour) {
      hourglass.triggerHour(now);
      hourglass.triggerMinute(now);
    } else if (min !== prevMin) {
      hourglass.triggerMinute(now);
    }
  }
  prevMin = min;
  prevHour = hour;
  prevDay = day;
  initialized = true;

  if (!hourglass.isFlipping) {
    const f = hourglass.flipped;
    syncStack(hourglass.upperSec, f ? sec : 60 - sec, now);
    syncStack(hourglass.lowerSec, f ? 60 - sec : sec, now);
    syncStack(hourglass.upperMin, f ? min : 60 - min, now);
    syncStack(hourglass.lowerMin, f ? 60 - min : min, now);
    syncStack(hourglass.upperHour, f ? hour : 24 - hour, now);
    syncStack(hourglass.lowerHour, f ? 24 - hour : hour, now);
  }
  hourglass.update(now);

  background.setTargetHour(hourFloat);
  background.update(deltaSec);
  if (!reducedMotion) dust.update(deltaSec);
  cameraRig.update(now, deltaSec);

  hud.update(virtualSec, speed, frozen);
  postfx.composer.render();
  requestAnimationFrame(tick);
}

requestAnimationFrame((now) => {
  cameraRig.start(now);
  tick(now);
});
