import './style.css';
import * as THREE from 'three';
import { Stack } from './stack';
import { Hud } from './hud';
import { c60Layout, hexRingsLayout } from './layouts';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e1a);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2.0, 7.0);
camera.lookAt(0, 0.6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(3, 6, 4);
scene.add(keyLight);

// Phase 1.5: A (C60) と D (Hex Rings) の並行比較。
// 採用形状を決めたら不要な方を落とし、4 スロット (sec/min/hour/day) のレイアウトに戻す。
const COLOR_C60 = 0x4a90e2;
const COLOR_HEX = 0xe07a5f;

const c60Stack = new Stack({
  positions: c60Layout(0.55),
  cellSize: 0.09,
  color: COLOR_C60,
  origin: new THREE.Vector3(-1.7, 0, 0),
});
scene.add(c60Stack.group);

const hexStack = new Stack({
  positions: hexRingsLayout(0.16),
  cellSize: 0.13,
  color: COLOR_HEX,
  origin: new THREE.Vector3(1.7, 0, 0),
});
scene.add(hexStack.group);

const hud = new Hud(document.body);
hud.setLabel(
  `<span style="color:#7ab1ec">●</span> A: C60 (左)　<span style="color:#e07a5f">●</span> D: Hex Rings (右)`
);

const startTime = performance.now();
let lastSecond = -1;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function tick(now: number) {
  const elapsedMs = now - startTime;
  const currentSecond = Math.floor(elapsedMs / 1000);

  if (currentSecond > lastSecond) {
    c60Stack.add(now);
    hexStack.add(now);
    if (c60Stack.count >= 60) {
      c60Stack.clear();
      hexStack.clear();
    }
    lastSecond = currentSecond;
  }

  c60Stack.update(now);
  hexStack.update(now);
  hud.update(elapsedMs);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
