// 平面の時間グリッド。N マスを塗っていくことで「経過量の絶対値」を一目化する。
//
// 設計:
//   - 入力は filled (0 〜 N の浮動小数)。整数部分は塗り済み、小数部分は進行中マス。
//   - レイアウトは表示領域 (canvas size) と N から自動算出: アスペクト比に近い cols/rows を選ぶ。
//   - 描画は requestAnimationFrame ごと (まずは素直に毎フレーム再描画)。
//   - マスは rounded rect。塗り済み = フル彩度のグラデ、進行中 = 半透明の塗り、未塗 = 暗い枠線のみ。

export interface GridOptions {
  count: number;
  scaleLabel: string;
  fillColor: string; // 例: "#f2c879"
  emissiveColor?: string; // 進行中マスのハイライト色 (省略時 fillColor)
}

export class TimeGrid {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private opts: GridOptions;
  private dpr = 1;
  /** 塗り目盛 (0 〜 count) */
  private filled = 0;

  constructor(canvas: HTMLCanvasElement, opts: GridOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
    this.opts = opts;
  }

  setSize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
  }

  setFilled(filled: number): void {
    this.filled = Math.max(0, Math.min(this.opts.count, filled));
  }

  setOptions(opts: GridOptions): void {
    this.opts = opts;
  }

  /** N をアスペクト比に合わせて cols × rows に配分 */
  private chooseLayout(W: number, H: number): { cols: number; rows: number } {
    const N = this.opts.count;
    const aspect = W / H;
    let best: { cols: number; rows: number; score: number } | null = null;
    for (let rows = 1; rows <= N; rows++) {
      const cols = Math.ceil(N / rows);
      if (cols * rows < N) continue;
      // アスペクト比のずれを最小化、かつ無駄マス (cols*rows - N) を抑える
      const cellAspect = (W / cols) / (H / rows);
      const aspectErr = Math.abs(Math.log(cellAspect / 1.0)); // セル ≒ 正方形が理想
      const fillErr = (cols * rows - N) * 0.05;
      const layoutErr = Math.abs(Math.log((cols / rows) / aspect)) * 0.5;
      const score = aspectErr + fillErr + layoutErr;
      if (!best || score < best.score) best = { cols, rows, score };
    }
    return best ?? { cols: N, rows: 1 };
  }

  render(now: number): void {
    const { ctx } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // 背景: 縦グラデ
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0e1c');
    g.addColorStop(1, '#02030a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // グリッドの占有領域 (中央、上下左右に余白)
    const padX = W * 0.08;
    const padTop = H * 0.18;
    const padBot = H * 0.18;
    const areaX = padX;
    const areaY = padTop;
    const areaW = W - padX * 2;
    const areaH = H - padTop - padBot;

    const { cols, rows } = this.chooseLayout(areaW, areaH);
    const gap = Math.max(2, Math.min(areaW / cols, areaH / rows) * 0.12);
    const cellW = (areaW - gap * (cols - 1)) / cols;
    const cellH = (areaH - gap * (rows - 1)) / rows;
    const radius = Math.min(cellW, cellH) * 0.18;

    const N = this.opts.count;
    const filled = this.filled;
    const intFilled = Math.floor(filled);
    const fracFilled = filled - intFilled;

    for (let i = 0; i < N; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = areaX + c * (cellW + gap);
      const y = areaY + r * (cellH + gap);
      this.drawCell(x, y, cellW, cellH, radius, i, intFilled, fracFilled, now);
    }

    // 上部ラベル
    this.drawHeaderLabel(W, H, now);
    // 下部進捗バー
    this.drawProgress(W, H, areaX, areaW, padBot, filled, N);
  }

  private drawCell(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    idx: number,
    intFilled: number,
    fracFilled: number,
    now: number,
  ): void {
    const { ctx } = this;
    const isFilled = idx < intFilled;
    const isCurrent = idx === intFilled;
    const fillColor = this.opts.fillColor;

    // セル枠 (常時)
    ctx.strokeStyle = isFilled || isCurrent ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1 * this.dpr;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();

    if (isFilled) {
      // 完全に塗られたマス: グラデ + わずかなインナーシャドウ風
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, fillColor);
      g.addColorStop(1, shade(fillColor, -0.25));
      ctx.fillStyle = g;
      roundRect(ctx, x, y, w, h, r);
      ctx.fill();
    } else if (isCurrent) {
      // 進行中マス: 下から上へ進捗で塗る + 脈動
      const fillH = h * fracFilled;
      const fillY = y + h - fillH;
      ctx.save();
      roundRect(ctx, x, y, w, h, r);
      ctx.clip();
      // 進捗塗り
      const g = ctx.createLinearGradient(x, fillY, x, y + h);
      g.addColorStop(0, alpha(fillColor, 0.95));
      g.addColorStop(1, alpha(shade(fillColor, -0.4), 0.85));
      ctx.fillStyle = g;
      ctx.fillRect(x, fillY, w, fillH);
      // 進捗の上端に細いハイライト線
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x, fillY - 0.5 * this.dpr, w, 1 * this.dpr);
      ctx.restore();

      // 脈動 (シマー)
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
      ctx.save();
      ctx.shadowColor = fillColor;
      ctx.shadowBlur = (8 + pulse * 6) * this.dpr;
      ctx.strokeStyle = alpha(fillColor, 0.35 + pulse * 0.4);
      ctx.lineWidth = 1.2 * this.dpr;
      roundRect(ctx, x, y, w, h, r);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawHeaderLabel(W: number, H: number, _now: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = '#7a8398';
    ctx.font = `${12 * this.dpr}px ui-monospace, "SF Mono", monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.2em';
    ctx.fillText(this.opts.scaleLabel.toUpperCase(), W / 2, H * 0.06);
    ctx.restore();
  }

  private drawProgress(
    W: number,
    _H: number,
    areaX: number,
    areaW: number,
    padBot: number,
    filled: number,
    N: number,
  ): void {
    const { ctx } = this;
    const barH = 2 * this.dpr;
    const y = this.canvas.height - padBot * 0.55;
    // 背景バー
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(areaX, y, areaW, barH);
    // 進捗バー
    const ratio = filled / N;
    ctx.fillStyle = this.opts.fillColor;
    ctx.fillRect(areaX, y, areaW * ratio, barH);
    // テキスト
    ctx.fillStyle = '#9ca3af';
    ctx.font = `${11 * this.dpr}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${filled.toFixed(2)} / ${N}`, areaX, y + 8 * this.dpr);
    ctx.textAlign = 'right';
    ctx.fillText(`${(ratio * 100).toFixed(1)}%`, areaX + areaW, y + 8 * this.dpr);
    void W;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, Math.min(w, h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function alpha(hex: string, a: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function shade(hex: string, factor: number): string {
  // factor: 負で暗く、正で明るく (-1..+1)
  const { r, g, b } = parseHex(hex);
  const k = 1 + factor;
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${cl(r)},${cl(g)},${cl(b)})`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
