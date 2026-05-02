import './style.css';
import * as THREE from 'three';
import { Stack } from './stack';
import { Hud } from './hud';
import { c60Layout, fibonacciSphereLayout, hexRingsLayout, linearStackLayout } from './layouts';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e1a);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 9);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(3, 6, 4);
scene.add(keyLight);

// Phase 2: 2 形状 (C60 / Hex) × 4 スケール (sec / min / hour / day) = 8 スタック並行表示
const COL_X = [-3, -1, 1, 3];
const ROW_Y_C60 = 1.4;
const ROW_Y_HEX = -1.4;

const COLOR_C60 = 0x4a90e2;
const COLOR_HEX = 0xe07a5f;
const DAY_CAP = 7;

const c60Stacks = {
  sec: new Stack({ positions: c60Layout(0.45), cellSize: 0.08, color: COLOR_C60, origin: new THREE.Vector3(COL_X[0], ROW_Y_C60, 0) }),
  min: new Stack({ positions: c60Layout(0.45), cellSize: 0.08, color: COLOR_C60, origin: new THREE.Vector3(COL_X[1], ROW_Y_C60, 0) }),
  hour: new Stack({ positions: fibonacciSphereLayout(24, 0.4), cellSize: 0.08, color: COLOR_C60, origin: new THREE.Vector3(COL_X[2], ROW_Y_C60, 0) }),
  day: new Stack({ positions: linearStackLayout(DAY_CAP, 0.16), cellSize: 0.13, color: COLOR_C60, origin: new THREE.Vector3(COL_X[3], ROW_Y_C60, 0) }),
};

const hexStacks = {
  sec: new Stack({ positions: hexRingsLayout(0.13, 60), cellSize: 0.10, color: COLOR_HEX, origin: new THREE.Vector3(COL_X[0], ROW_Y_HEX, 0) }),
  min: new Stack({ positions: hexRingsLayout(0.13, 60), cellSize: 0.10, color: COLOR_HEX, origin: new THREE.Vector3(COL_X[1], ROW_Y_HEX, 0) }),
  hour: new Stack({ positions: hexRingsLayout(0.13, 24), cellSize: 0.10, color: COLOR_HEX, origin: new THREE.Vector3(COL_X[2], ROW_Y_HEX, 0) }),
  day: new Stack({ positions: linearStackLayout(DAY_CAP, 0.16), cellSize: 0.13, color: COLOR_HEX, origin: new THREE.Vector3(COL_X[3], ROW_Y_HEX, 0) }),
};

[...Object.values(c60Stacks), ...Object.values(hexStacks)].forEach((s) => scene.add(s.group));

const hud = new Hud(document.body);

// デフォルトは実時間 (speed=1)。高速比較したい時は ?speed=60 等で URL から上書き可能。
const speed = Math.max(0.1, parseFloat(new URL(location.href).searchParams.get('speed') ?? '1'));

let virtualMs = 0;
let lastFrameNow = performance.now();
let frozen = false;

// 連続押し判定: 300ms 以内の押下回数で 1m / 10m / 1h を切り替え
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
    return;
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function syncStack(stack: Stack, target: number, now: number): void {
  if (stack.count > target) stack.clear();
  while (stack.count < target) stack.add(now);
}

function tick(now: number) {
  const delta = now - lastFrameNow;
  lastFrameNow = now;
  if (!frozen) virtualMs += delta * speed;

  const virtualSec = Math.floor(virtualMs / 1000);
  const sec = virtualSec % 60;
  const min = Math.floor(virtualSec / 60) % 60;
  const hour = Math.floor(virtualSec / 3600) % 24;
  const day = Math.min(DAY_CAP, Math.floor(virtualSec / 86400));

  syncStack(c60Stacks.sec, sec, now);
  syncStack(c60Stacks.min, min, now);
  syncStack(c60Stacks.hour, hour, now);
  syncStack(c60Stacks.day, day, now);
  syncStack(hexStacks.sec, sec, now);
  syncStack(hexStacks.min, min, now);
  syncStack(hexStacks.hour, hour, now);
  syncStack(hexStacks.day, day, now);

  Object.values(c60Stacks).forEach((s) => s.update(now));
  Object.values(hexStacks).forEach((s) => s.update(now));

  hud.update(virtualSec, speed, frozen);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
