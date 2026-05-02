import './style.css';
import * as THREE from 'three';
import { syncStack } from './stack';
import { Hud } from './hud';
import { Hourglass } from './hourglass';
import { createPostFx } from './postfx';

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
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(3, 6, 4);
scene.add(keyLight);

const hourglass = new Hourglass({
  origin: new THREE.Vector3(0, 0, 0),
  height: 2.0,
  rimRadius: 1.4,
  scene,
});
scene.add(hourglass.group);

const postfx = createPostFx(renderer, scene, camera);

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
  if (!frozen) virtualMs += delta * speed;

  const virtualSec = Math.floor(virtualMs / 1000);
  const sec = virtualSec % 60;
  const min = Math.floor(virtualSec / 60) % 60;
  const hour = Math.floor(virtualSec / 3600) % 24;
  const day = Math.floor(virtualSec / 86400);

  if (initialized && !hourglass.isFlipping) {
    if (day !== prevDay) {
      hourglass.startFlip(now);
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

  hud.update(virtualSec, speed, frozen);
  postfx.composer.render();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
