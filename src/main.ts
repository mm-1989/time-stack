import './style.css';
import { VirtualClock } from './time';
import { TimeGrid } from './grid';
import { Hud } from './hud';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const canvas = document.createElement('canvas');
canvas.className = 'time-canvas';
app.appendChild(canvas);

const speed = Math.max(0.1, parseFloat(new URL(location.href).searchParams.get('speed') ?? '1'));
const wallStart = performance.now();
const clock = new VirtualClock(speed, wallStart);

// Phase 4a: 1 日モードのみ (24 マス、1 時間で 1 マス)
const grid = new TimeGrid(canvas, {
  count: 24,
  scaleLabel: '1 day · 24 hours',
  fillColor: '#f2c879',
});

const hud = new Hud(document.body);

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

function tick(now: number): void {
  const virtualMs = clock.tick(now);
  // 1 日 = 86_400_000 ms
  const filled = (virtualMs / 86_400_000) * 24;
  grid.setFilled(filled);
  grid.render(now);
  hud.update(virtualMs, speed, clock.frozen);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
