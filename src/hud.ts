// 平面ビュー用 HUD: 経過時間 + 状態 + 操作ヒント。
// 3D 砂時計版から、機能を簡素化しつつフェード演出は維持。

import { formatJstClock } from './time';

export class Hud {
  private wrap: HTMLDivElement;
  private elapsedEl: HTMLDivElement;
  private subEl: HTMLDivElement;
  private jstEl: HTMLDivElement;
  private debugEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private hintTimer: number | null = null;

  constructor(parent: HTMLElement) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'hud';
    this.wrap.setAttribute('role', 'status');
    this.wrap.setAttribute('aria-live', 'off'); // 毎秒変動するので screen reader 読み上げは off
    parent.appendChild(this.wrap);

    this.elapsedEl = document.createElement('div');
    this.elapsedEl.className = 'hud-time';
    this.elapsedEl.setAttribute('aria-label', '経過時間');
    this.wrap.appendChild(this.elapsedEl);

    this.subEl = document.createElement('div');
    this.subEl.className = 'hud-sub';
    this.wrap.appendChild(this.subEl);

    this.jstEl = document.createElement('div');
    this.jstEl.className = 'hud-jst';
    this.wrap.appendChild(this.jstEl);

    this.debugEl = document.createElement('div');
    this.debugEl.className = 'hud-debug';
    this.wrap.appendChild(this.debugEl);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hud-hint';
    // モバイルでは tap 操作 + ヒントとバッジの干渉回避のため M/H/D 部分を省略
    const isCoarse = window.matchMedia('(max-width: 640px), (pointer: coarse)').matches;
    this.hintEl.innerHTML = isCoarse
      ? '<kbd>Space</kbd> 一時停止 ・ <kbd>?speed=N</kbd> で時間倍率'
      : '<kbd>M</kbd> / <kbd>H</kbd> / <kbd>D</kbd> スケール切替 ・ ' +
        '<kbd>Space</kbd> 一時停止 ・ <kbd>S</kbd> サウンド ・ <kbd>Shift+Click</kbd> でジャンプ';
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

    const isRealtime = Math.abs(speed - 1) < 0.001;
    const speedTxt = isRealtime ? '実時間' : `×${speed}`;
    this.subEl.textContent = frozen ? `${speedTxt}  ⏸ FROZEN` : speedTxt;

    // 壁時計 (JST): 加速モードで経過時間と乖離する時のみ表示。
    // 実時間モードでは経過時間 = JST と等価なので非表示にして冗長を避ける。
    this.wrap.classList.toggle('hud-realtime', isRealtime);
    this.jstEl.textContent = `JST  ${formatJstClock(Date.now())}`;
  }

  /** デバッグ情報を画面左上に表示 (?debug クエリ用) */
  setDebug(text: string): void {
    this.debugEl.textContent = text;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
