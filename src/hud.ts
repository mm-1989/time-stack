export class Hud {
  private wrap: HTMLDivElement;
  private elapsedEl: HTMLDivElement;
  private subEl: HTMLDivElement;
  private legendEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private hintTimer: number | null = null;

  constructor(parent: HTMLElement) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'hud';
    parent.appendChild(this.wrap);

    this.elapsedEl = document.createElement('div');
    this.elapsedEl.className = 'hud-time';
    this.wrap.appendChild(this.elapsedEl);

    this.subEl = document.createElement('div');
    this.subEl.className = 'hud-sub';
    this.wrap.appendChild(this.subEl);

    this.legendEl = document.createElement('div');
    this.legendEl.className = 'hud-legend';
    this.legendEl.innerHTML =
      '<span class="dot dot-sec"></span>秒' +
      '<span class="dot dot-min"></span>分' +
      '<span class="dot dot-hour"></span>時' +
      '<span class="legend-meta">1日で反転</span>';
    this.wrap.appendChild(this.legendEl);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hud-hint';
    this.hintEl.innerHTML =
      '<kbd>drag</kbd> 視点回転 ・ <kbd>Space</kbd> 一時停止 ・ ' +
      '<kbd>→</kbd> +1分 / +10分 / +1時';
    parent.appendChild(this.hintEl);

    // 起動時のフェードイン (style.css 側で初期 opacity:0 + fade-in アニメ)
    requestAnimationFrame(() => {
      this.wrap.classList.add('hud-on');
      this.hintEl.classList.add('hud-on');
    });

    // ヒントは 6 秒後にフェードアウト。マウスを動かすとリセットして再表示。
    this.scheduleHintHide();
    window.addEventListener('pointermove', () => this.bumpHint(), { passive: true });
    window.addEventListener('keydown', () => this.bumpHint(), { passive: true });
  }

  private scheduleHintHide(): void {
    if (this.hintTimer !== null) window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.add('hud-fade'), 6000);
  }

  private bumpHint(): void {
    this.hintEl.classList.remove('hud-fade');
    this.scheduleHintHide();
  }

  update(virtualSec: number, speed: number, frozen: boolean): void {
    const sec = virtualSec % 60;
    const min = Math.floor(virtualSec / 60) % 60;
    const hour = Math.floor(virtualSec / 3600) % 24;
    const day = Math.floor(virtualSec / 86400);

    // 大きい主表示: 経過時間
    this.elapsedEl.innerHTML =
      `<span class="d">${day}</span><span class="u">d</span> ` +
      `<span class="d">${pad(hour)}</span><span class="sep">:</span>` +
      `<span class="d">${pad(min)}</span><span class="sep">:</span>` +
      `<span class="d">${pad(sec)}</span>`;
    this.elapsedEl.classList.toggle('hud-frozen', frozen);

    // サブ: 速度倍率と FROZEN マーク
    const speedTxt = speed === 1 ? '実時間' : `×${speed}`;
    this.subEl.textContent = frozen ? `${speedTxt}  ⏸ FROZEN` : speedTxt;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
