export class Hud {
  private elapsedEl: HTMLDivElement;
  private breakdownEl: HTMLDivElement;
  private labelEl: HTMLDivElement;

  constructor(parent: HTMLElement) {
    const wrap = document.createElement('div');
    wrap.className = 'hud';
    parent.appendChild(wrap);

    this.elapsedEl = document.createElement('div');
    wrap.appendChild(this.elapsedEl);

    this.breakdownEl = document.createElement('div');
    this.breakdownEl.className = 'hud-sub';
    wrap.appendChild(this.breakdownEl);

    this.labelEl = document.createElement('div');
    this.labelEl.className = 'hud-sub';
    wrap.appendChild(this.labelEl);
    this.labelEl.innerHTML =
      '<span style="color:#7ab1ec">●</span> C60 (上)　<span style="color:#e8a08a">●</span> Hex (下)　│　左から sec / min / hour / day';
  }

  update(virtualSec: number, speed: number): void {
    const sec = virtualSec % 60;
    const min = Math.floor(virtualSec / 60) % 60;
    const hour = Math.floor(virtualSec / 3600) % 24;
    const day = Math.floor(virtualSec / 86400);
    this.elapsedEl.textContent = `virtual ${day}d ${pad(hour)}:${pad(min)}:${pad(sec)}　×${speed}`;
    this.breakdownEl.textContent = `sec ${sec}/60　min ${min}/60　hour ${hour}/24　day ${day}`;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
