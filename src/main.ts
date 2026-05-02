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
const DAY_CAP = 7; // 1 週間で day タワー上限。Phase 2 では 7 日見せれば十分

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

// 速度倍率: ?speed=N で指定。デフォルト 60(1 実秒 = 1 仮想分)。
const speed = Math.max(0.1, parseFloat(new URL(location.href).searchParams.get('speed') ?? '60'));

const startTime = performance.now();

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
  const virtualSec = Math.floor(((now - startTime) * speed) / 1000);
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

  hud.update(virtualSec, speed);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
