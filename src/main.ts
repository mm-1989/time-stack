import './style.css';
import { VirtualClock } from './time';
import { TimeGrid } from './grid';
import { Hud } from './hud';
import { SCALES, filledFor, type ScaleId } from './scales';
import { ScaleSwitch } from './scaleSwitch';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');

const canvas = document.createElement('canvas');
canvas.className = 'time-canvas';
app.appendChild(canvas);

const speed = Math.max(0.1, parseFloat(new URL(location.href).searchParams.get('speed') ?? '1'));
const clock = new VirtualClock(speed, performance.now());

let currentScaleId: ScaleId = (new URL(location.href).searchParams.get('scale') as ScaleId) ?? 'day';
if (!(currentScaleId in SCALES)) currentScaleId = 'day';

const grid = new TimeGrid(canvas, scaleToGridOpts(currentScaleId));
const hud = new Hud(document.body);
new ScaleSwitch(document.body, currentScaleId, (id) => {
  currentScaleId = id;
  grid.setOptions(scaleToGridOpts(id));
});

function scaleToGridOpts(id: ScaleId): {
  count: number;
  scaleLabel: string;
  fillColor: string;
} {
  const s = SCALES[id];
  return { count: s.count, scaleLabel: s.label, fillColor: s.fillColor };
}

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
  const filled = filledFor(SCALES[currentScaleId], virtualMs);
  grid.setFilled(filled);
  grid.render(now);
  hud.update(virtualMs, speed, clock.frozen);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
