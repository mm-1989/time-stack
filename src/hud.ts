export class Hud {
  private el: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    parent.appendChild(this.el);
  }

  update(elapsedMs: number): void {
    const totalSec = Math.floor(elapsedMs / 1000);
    const hh = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    this.el.textContent = `elapsed  ${hh}:${mm}:${ss}`;
  }
}
