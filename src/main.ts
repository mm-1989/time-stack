import './style.css';
import * as THREE from 'three';
import { Stack } from './stack';
import { Hud } from './hud';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e1a);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 2.4, 7.5);
camera.lookAt(0, 1.2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(3, 6, 4);
scene.add(keyLight);

const SLOT_WIDTH = 2.6;
const slots = [-1.5, -0.5, 0.5, 1.5].map((m) => m * SLOT_WIDTH);

const seconds = new Stack({
  capacity: 60,
  cols: 6,
  cellSize: 0.16,
  spacing: 0.19,
  color: 0x4a90e2,
  position: new THREE.Vector3(slots[0], 0, 0),
});
scene.add(seconds.group);

// Phase 2 で minutes / hours / days のスタックをここに追加する。
// スロット位置 (slots[1..3]) は確保済み。

const hud = new Hud(document.body);

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
    seconds.add(now);
    if (seconds.count >= 60) {
      // Phase 1 仮実装: 60 秒で単純リセット。Phase 2 で minutes への昇格演出に置換。
      seconds.clear();
    }
    lastSecond = currentSecond;
  }

  seconds.update(now);
  hud.update(elapsedMs);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
