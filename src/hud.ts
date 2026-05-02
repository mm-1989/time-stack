export class Hud {
  private elapsedEl: HTMLDivElement;
  private breakdownEl: HTMLDivElement;
  private labelEl: HTMLDivElement;
  private debugEl: HTMLDivElement;

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
      '<span style="color:#fff5d0">●</span> 秒 (中心軸)　' +
      '<span style="color:#b48b5a">●</span> 分 (中層)　' +
      '<span style="color:#f2c879">●</span> 時 (外層)　│　1日で反転';

    this.debugEl = document.createElement('div');
    this.debugEl.className = 'hud-debug';
    wrap.appendChild(this.debugEl);
    this.debugEl.innerHTML =
      'debug: <kbd>Space</kbd> freeze · <kbd>→</kbd> +1m / <kbd>→→</kbd> +10m / <kbd>→→→</kbd> +1h';
  }

  update(virtualSec: number, speed: number, frozen: boolean): void {
    const sec = virtualSec % 60;
    const min = Math.floor(virtualSec / 60) % 60;
    const hour = Math.floor(virtualSec / 3600) % 24;
    const day = Math.floor(virtualSec / 86400);
    const status = frozen ? '  ⏸ FROZEN' : '';
    this.elapsedEl.textContent = `virtual ${day}d ${pad(hour)}:${pad(min)}:${pad(sec)}　×${speed}${status}`;
    this.elapsedEl.classList.toggle('hud-frozen', frozen);
    this.breakdownEl.textContent = `sec ${sec}/60　min ${min}/60　hour ${hour}/24　day ${day}`;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
