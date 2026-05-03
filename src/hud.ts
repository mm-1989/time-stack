// 平面ビュー用 HUD: 経過時間 + 状態 + 操作ヒント。
// 3D 砂時計版から、機能を簡素化しつつフェード演出は維持。

import { formatJstClock } from './time';
import { t } from './i18n';

export class Hud {
  private wrap: HTMLDivElement;
  private elapsedEl: HTMLDivElement;
  private subEl: HTMLDivElement;
  private jstEl: HTMLDivElement;
  private countdownEl: HTMLDivElement;
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

    this.countdownEl = document.createElement('div');
    this.countdownEl.className = 'hud-countdown';
    this.wrap.appendChild(this.countdownEl);

    this.debugEl = document.createElement('div');
    this.debugEl.className = 'hud-debug';
    this.wrap.appendChild(this.debugEl);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hud-hint';
    // モバイルでは tap 操作 + ヒントとバッジの干渉回避のため M/H/D 部分を省略
    const isCoarse = window.matchMedia('(max-width: 640px), (pointer: coarse)').matches;
    this.hintEl.innerHTML = isCoarse ? t('hint.shortcuts.coarse') : t('hint.shortcuts');
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
    const speedTxt = isRealtime ? t('hud.realtime') : `×${speed}`;
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

  /** countdown モード時の残時間表示。null で非表示。 */
  setCountdown(targetDate: Date | null): void {
    if (!targetDate) {
      this.countdownEl.textContent = '';
      return;
    }
    const remaining = targetDate.getTime() - Date.now();
    if (remaining <= 0) {
      this.countdownEl.textContent = `→ ${formatTargetDate(targetDate)} · ${t('hud.countdown.reached')}`;
      return;
    }
    const totalSec = Math.floor(remaining / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor(totalSec / 3600) % 24;
    const mins = Math.floor(totalSec / 60) % 60;
    const secs = totalSec % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}D`);
    if (days > 0 || hours > 0) parts.push(`${pad(hours)}H`);
    parts.push(`${pad(mins)}M`);
    parts.push(`${pad(secs)}S`);
    this.countdownEl.textContent = `→ ${formatTargetDate(targetDate)} · ${parts.join(' ')} ${t('hud.countdown.suffix')}`;
  }
}

function formatTargetDate(d: Date): string {
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
