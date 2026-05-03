// 平面ビュー用 HUD: 経過時間 + 状態 + 操作ヒント。
// 3D 砂時計版から、機能を簡素化しつつフェード演出は維持。

import { formatJstClock } from './time';

export class Hud {
  private wrap: HTMLDivElement;
  private elapsedEl: HTMLDivElement;
  private subEl: HTMLDivElement;
  private jstEl: HTMLDivElement;
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

    this.jstEl = document.createElement('div');
    this.jstEl.className = 'hud-jst';
    this.wrap.appendChild(this.jstEl);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hud-hint';
    this.hintEl.innerHTML =
      '<kbd>M</kbd> / <kbd>H</kbd> / <kbd>D</kbd> スケール切替 ・ ' +
      '<kbd>Space</kbd> 一時停止 ・ <kbd>?speed=N</kbd> で時間倍率';
    parent.appendChild(this.hintEl);

    requestAnimationFrame(() => {
      this.wrap.classList.add('hud-on');
      this.hintEl.classList.add('hud-on');
    });

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

  update(virtualMs: number, speed: number, frozen: boolean): void {
    const totalSec = Math.floor(virtualMs / 1000);
    const sec = totalSec % 60;
    const min = Math.floor(totalSec / 60) % 60;
    const hour = Math.floor(totalSec / 3600) % 24;
    const day = Math.floor(totalSec / 86400);

    this.elapsedEl.innerHTML =
      `<span class="d">${day}</span><span class="u">d</span> ` +
      `<span class="d">${pad(hour)}</span><span class="sep">:</span>` +
      `<span class="d">${pad(min)}</span><span class="sep">:</span>` +
      `<span class="d">${pad(sec)}</span>`;
    this.elapsedEl.classList.toggle('hud-frozen', frozen);

    const speedTxt = speed === 1 ? '実時間' : `×${speed}`;
    this.subEl.textContent = frozen ? `${speedTxt}  ⏸ FROZEN` : speedTxt;

    // 壁時計 (JST 現在時刻): 起動オフセットの根拠を可視化
    this.jstEl.textContent = `JST  ${formatJstClock(Date.now())}`;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
