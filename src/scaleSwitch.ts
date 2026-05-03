import { SCALE_ORDER, SCALES, type ScaleId } from './scales';

// スケール切替 UI: 上部中央に 3 ボタン。クリック / キーボード (m/h/d) / 矢印切替に対応。

export class ScaleSwitch {
  private root: HTMLDivElement;
  private buttons = new Map<ScaleId, HTMLButtonElement>();
  private current: ScaleId;
  private onChange: (id: ScaleId) => void;

  constructor(parent: HTMLElement, initial: ScaleId, onChange: (id: ScaleId) => void) {
    this.current = initial;
    this.onChange = onChange;

    this.root = document.createElement('div');
    this.root.className = 'scale-switch';
    parent.appendChild(this.root);

    for (const id of SCALE_ORDER) {
      const btn = document.createElement('button');
      btn.className = 'scale-btn';
      btn.type = 'button';
      btn.dataset.scale = id;
      btn.innerHTML = `<span class="scale-dot" style="background:${SCALES[id].fillColor}"></span><span class="scale-label">${SCALES[id].shortLabel}</span>`;
      btn.addEventListener('click', () => this.set(id));
      this.root.appendChild(btn);
      this.buttons.set(id, btn);
    }
    this.refresh();

    requestAnimationFrame(() => this.root.classList.add('hud-on'));

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'KeyM') this.set('minute');
      else if (e.code === 'KeyH') this.set('hour');
      else if (e.code === 'KeyD') this.set('day');
      else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        const dir = e.code === 'BracketRight' ? 1 : -1;
        const i = SCALE_ORDER.indexOf(this.current);
        const next = SCALE_ORDER[(i + dir + SCALE_ORDER.length) % SCALE_ORDER.length];
        this.set(next);
      }
    });
  }

  set(id: ScaleId): void {
    if (this.current === id) return;
    this.current = id;
    this.refresh();
    this.onChange(id);
  }

  private refresh(): void {
    for (const [id, btn] of this.buttons) {
      btn.classList.toggle('active', id === this.current);
    }
  }
}
