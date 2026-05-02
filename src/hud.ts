export class Hud {
  private elapsedEl: HTMLDivElement;
  private labelEl: HTMLDivElement;

  constructor(parent: HTMLElement) {
    const wrap = document.createElement('div');
    wrap.className = 'hud';
    parent.appendChild(wrap);

    this.elapsedEl = document.createElement('div');
    wrap.appendChild(this.elapsedEl);

    this.labelEl = document.createElement('div');
    this.labelEl.className = 'hud-sub';
    wrap.appendChild(this.labelEl);
  }

  setLabel(html: string): void {
    this.labelEl.innerHTML = html;
  }

  update(elapsedMs: number): void {
    const totalSec = Math.floor(elapsedMs / 1000);
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    this.elapsedEl.textContent = `elapsed  ${hh}:${mm}:${ss}`;
  }
}
