// ミニチュア上位ビュー: 画面右上に「現在スケール +1 階層」のグリッドを常時表示。
// 例: minute モード時 → 右上に hour のミニ 60 マス、現在 N 分目進行中。
// 「今、上位の何マス目にいるか」がメインビューを切り替えずに分かる。

import { SCALES, type ScaleId } from './scales';

export class MiniGrid {
  private root: HTMLDivElement;
  private grid: HTMLDivElement;
  private label: HTMLDivElement;
  private cells: HTMLDivElement[] = [];
  private current: ScaleId | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'mini-grid hidden';
    parent.appendChild(this.root);

    this.label = document.createElement('div');
    this.label.className = 'mini-grid-label';
    this.root.appendChild(this.label);

    this.grid = document.createElement('div');
    this.grid.className = 'mini-grid-cells';
    this.root.appendChild(this.grid);
  }

  /** 表示する上位スケール (null = 上位なし → 非表示)。
   *  count は month のように暦由来で変わるスケール用に override できる */
  setScale(id: ScaleId | null, countOverride?: number): void {
    if (id === null) {
      if (this.current === null) return;
      this.current = null;
      this.grid.innerHTML = '';
      this.cells = [];
      this.root.classList.add('hidden');
      return;
    }
    const s = SCALES[id];
    const count = countOverride ?? s.count;
    // 同じ scale でも count が変わる (月跨ぎ等) なら再構築
    if (this.current === id && this.cells.length === count) return;
    this.current = id;
    this.grid.innerHTML = '';
    this.cells = [];
    this.root.classList.remove('hidden');
    this.label.textContent = `↗ ${s.shortLabel}`;
    // cols: 28-31 → 7, 24 → 6, 12 → 4, それ以外 → 12
    const cols = count <= 12 ? 4 : count === 24 ? 6 : count <= 31 ? 7 : 12;
    this.grid.style.setProperty('--cols', String(cols));
    this.grid.style.setProperty('--mini-color', s.fillColor);
    for (let i = 0; i < count; i++) {
      const cell = document.createElement('div');
      cell.className = 'mini-cell';
      this.grid.appendChild(cell);
      this.cells.push(cell);
    }
  }

  /** 上位スケールの進捗 (0..count) を渡してマスを点灯 */
  setFilled(filled: number): void {
    if (this.current === null) return;
    const intF = Math.floor(filled);
    const frac = filled - intF;
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (i < intF) {
        cell.style.opacity = '1';
        cell.classList.remove('mini-cell-current');
      } else if (i === intF) {
        cell.style.opacity = String(0.35 + frac * 0.5);
        cell.classList.add('mini-cell-current');
      } else {
        cell.style.opacity = '0.12';
        cell.classList.remove('mini-cell-current');
      }
    }
  }
}
