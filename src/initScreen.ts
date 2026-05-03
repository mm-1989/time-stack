// 起動時の起点選択画面。NOW (JST 本日 0:00:00 起点) or 任意日時 を選んで BEGIN。
// 選択結果を Promise<Origin> で返す。URL に ?since がある場合はこの画面を skip。

import type { Origin } from './origin';

export class InitScreen {
  private root: HTMLDivElement;
  private resolveFn: ((o: Origin) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'init-screen';
    this.root.innerHTML = `
      <div class="init-panel">
        <div class="init-title">&gt;&nbsp;SELECT ORIGIN</div>
        <div class="init-options">
          <button class="init-opt active" data-opt="now" type="button">
            <span class="init-opt-label">NOW</span>
            <span class="init-opt-sub">いまこの瞬間から計測 (スケールが順次アンロック)</span>
          </button>
          <button class="init-opt" data-opt="custom" type="button">
            <span class="init-opt-label">CUSTOM</span>
            <span class="init-opt-sub">起点日時を指定 (誕生日 / 記念日 etc.)</span>
          </button>
        </div>
        <div class="init-custom-input hidden">
          <input type="datetime-local" class="init-date" />
        </div>
        <button class="init-begin" type="button">&gt;&nbsp;BEGIN</button>
      </div>
    `;
    parent.appendChild(this.root);
    this.bind();
  }

  private bind(): void {
    const opts = this.root.querySelectorAll<HTMLButtonElement>('.init-opt');
    const customInput = this.root.querySelector<HTMLDivElement>('.init-custom-input')!;
    const dateInput = this.root.querySelector<HTMLInputElement>('.init-date')!;
    let selected: 'now' | 'custom' = 'now';

    // CUSTOM 入力の初期値: 1 年前の今日
    const oneYearAgo = new Date(Date.now() - 365 * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    dateInput.value = `${oneYearAgo.getFullYear()}-${pad(oneYearAgo.getMonth() + 1)}-${pad(oneYearAgo.getDate())}T00:00`;

    opts.forEach((btn) => {
      btn.addEventListener('click', () => {
        opts.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selected = btn.dataset.opt as 'now' | 'custom';
        customInput.classList.toggle('hidden', selected !== 'custom');
      });
    });

    const begin = () => {
      let origin: Origin;
      if (selected === 'custom') {
        const d = new Date(dateInput.value);
        if (isNaN(d.getTime())) return;
        origin = { mode: 'custom', date: d };
      } else {
        origin = { mode: 'now' };
      }
      this.resolveFn?.(origin);
    };
    this.root.querySelector<HTMLButtonElement>('.init-begin')!.addEventListener('click', begin);
    // Enter キーでも開始
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') begin();
    });
  }

  show(): Promise<Origin> {
    return new Promise((resolve) => {
      this.resolveFn = (o) => {
        this.hide();
        resolve(o);
      };
    });
  }

  private hide(): void {
    this.root.classList.add('gone');
    setTimeout(() => this.root.remove(), 400);
  }
}
