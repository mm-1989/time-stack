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

const COL_X = [-3, -1, 1, 3];
const ROW_Y_C60 = 1.4;
const ROW_Y_HEX = -1.4;
const COLOR_C60 = 0x4a90e2;
const COLOR_HEX = 0xe07a5f;
const DAY_CAP = 4;

// ---------- フラクタル素材(C60 列で使用) ----------
// 共有ジオメトリ(レベルごとに 1 個ずつ、全クラスターで再利用)
const G_SEC = new THREE.BoxGeometry(0.04, 0.04, 0.04);
const G_SUBCELL = new THREE.BoxGeometry(0.013, 0.013, 0.013);
const G_MINBALL = new THREE.SphereGeometry(0.013, 8, 8);
const G_HOURBALL = new THREE.SphereGeometry(0.022, 10, 10);
const M_C60 = new THREE.MeshStandardMaterial({ color: COLOR_C60, roughness: 0.5, metalness: 0.1 });

// 内部クラスターの位置(原点中心 → 後で個別 box の中で再利用)
const INNER_C60_CELLS = c60Layout(0.085);
INNER_C60_CELLS.forEach((p) => (p.y -= 0.085));
const INNER_C60_BALLS = c60Layout(0.085);
INNER_C60_BALLS.forEach((p) => (p.y -= 0.085));
const INNER_FIB24 = fibonacciSphereLayout(24, 0.16);
INNER_FIB24.forEach((p) => (p.y -= 0.16));

function singleMesh(geom: THREE.BufferGeometry, mat: THREE.Material): () => THREE.Object3D {
  return () => new THREE.Mesh(geom, mat);
}

function instancedCluster(
  geom: THREE.BufferGeometry,
  mat: THREE.Material,
  positions: THREE.Vector3[]
): () => THREE.Object3D {
  return () => {
    const inst = new THREE.InstancedMesh(geom, mat, positions.length);
    const m = new THREE.Matrix4();
    for (let i = 0; i < positions.length; i++) {
      m.setPosition(positions[i]);
      inst.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  };
}

// ---------- C60 行(フラクタル入れ子) ----------
const c60Stacks = {
  sec: new Stack({
    positions: c60Layout(0.45),
    createBox: singleMesh(G_SEC, M_C60),
    origin: new THREE.Vector3(COL_X[0], ROW_Y_C60, 0),
  }),
  min: new Stack({
    positions: c60Layout(0.45),
    createBox: instancedCluster(G_SUBCELL, M_C60, INNER_C60_CELLS),
    origin: new THREE.Vector3(COL_X[1], ROW_Y_C60, 0),
  }),
  hour: new Stack({
    positions: fibonacciSphereLayout(24, 0.4),
    createBox: instancedCluster(G_MINBALL, M_C60, INNER_C60_BALLS),
    origin: new THREE.Vector3(COL_X[2], ROW_Y_C60, 0),
  }),
  day: new Stack({
    positions: linearStackLayout(DAY_CAP, 0.42),
    createBox: instancedCluster(G_HOURBALL, M_C60, INNER_FIB24),
    origin: new THREE.Vector3(COL_X[3], ROW_Y_C60, 0),
  }),
};

// ---------- Hex 行(フラットなまま比較用) ----------
const G_HEX_CELL = new THREE.BoxGeometry(0.10, 0.10, 0.10);
const G_HEX_DAY = new THREE.BoxGeometry(0.13, 0.13, 0.13);
const M_HEX = new THREE.MeshStandardMaterial({ color: COLOR_HEX, roughness: 0.5, metalness: 0.1 });

const hexStacks = {
  sec: new Stack({
    positions: hexRingsLayout(0.13, 60),
    createBox: singleMesh(G_HEX_CELL, M_HEX),
    origin: new THREE.Vector3(COL_X[0], ROW_Y_HEX, 0),
  }),
  min: new Stack({
    positions: hexRingsLayout(0.13, 60),
    createBox: singleMesh(G_HEX_CELL, M_HEX),
    origin: new THREE.Vector3(COL_X[1], ROW_Y_HEX, 0),
  }),
  hour: new Stack({
    positions: hexRingsLayout(0.13, 24),
    createBox: singleMesh(G_HEX_CELL, M_HEX),
    origin: new THREE.Vector3(COL_X[2], ROW_Y_HEX, 0),
  }),
  day: new Stack({
    positions: linearStackLayout(DAY_CAP, 0.18),
    createBox: singleMesh(G_HEX_DAY, M_HEX),
    origin: new THREE.Vector3(COL_X[3], ROW_Y_HEX, 0),
  }),
};

[...Object.values(c60Stacks), ...Object.values(hexStacks)].forEach((s) => scene.add(s.group));

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
