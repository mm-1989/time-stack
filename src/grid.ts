// 平面の時間グリッド。N マスを塗っていくことで「経過量の絶対値」を一目化する。
//
// 設計:
//   - 入力は filled (0 〜 N の浮動小数)。整数部分は塗り済み、小数部分は進行中マス。
//   - レイアウトは表示領域 (canvas size) と N から自動算出: アスペクト比に近い cols/rows を選ぶ。
//   - スケール切替時は transitionTo() で OUT → IN の 2 段階アニメに入る:
//     OUT = 旧スケールの進行中マスが画面中央へズームイン、他はフェードアウト
//     IN  = 新スケールのマスが中央から外側へ stagger で展開

import { drawPromotion, type PromotionFlight } from './promotion';

export interface GridOptions {
  count: number;
  scaleLabel: string;
  fillColor: string;
  /** 1 マス内に描く下位粒子の数 (0 で粒子なし、進行中マスのみ可視化) */
  subdivisions?: number;
  /** 進行中マス下に添える単位ラベル ('h' / 'm' / 's')。例: 1 day モードで 14 番目進行中なら "14h" */
  unit?: string;
}

type Mode = 'idle' | 'out' | 'in' | 'collapse';

const OUT_MS = 380;
const IN_MS = 520;
// 集約をじっくり見せる + Playwright waitForTimeout の ±200ms ジッタを吸収
const COLLAPSE_MS = 1300;

export class TimeGrid {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private opts: GridOptions;
  private dpr = 1;
  private filled = 0;

  private mode: Mode = 'idle';
  private tStart = 0;
  private prevOpts: GridOptions | null = null;
  private prevFilled = 0;

  // マス完了フラッシュ: idx → 開始時刻
  private completedFlashes = new Map<number, number>();
  private prevIntFilled = -1;
  private static readonly FLASH_MS = 700;

  // アクティブセルが進行中入りした時刻 (フワッと拡大アニメに使う)
  private currentEntryStart = -Infinity;
  private currentEntryIdx = -1;
  private static readonly ENTRY_MS = 420;

  // 時刻境界エフェクト
  private dayWaveStart = -Infinity;
  private static readonly DAY_WAVE_MS = 1800;

  // collapse 完了後の余韻 (中央に小さい光点が残ってフェード) — 「1 周期 = 1 つに畳まれた」読み解きの完成
  private afterglowStart = -Infinity;
  private static readonly AFTERGLOW_MS = 700;

  // 階層昇格フライト (promotion): 集約された 1 単位が上位スケールバッジへ飛んでいく
  private promotions: PromotionFlight[] = [];

  // すべての演出 duration に掛かる倍率。?animSlow=N で N 倍にスローモー化 (デフォルト 1)
  private animSlow = 1;

  constructor(canvas: HTMLCanvasElement, opts: GridOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
    this.opts = opts;
  }

  setAnimSlow(multiplier: number): void {
    this.animSlow = Math.max(0.1, multiplier);
  }

  /** スロー倍率を掛けた duration を返す。各 *_MS の代わりにこれを使う */
  private ms(base: number): number {
    return base * this.animSlow;
  }

  /** promotion duration をスロー倍率込みで取得 (main.ts から flight 生成時に使う) */
  get scaledAnim(): number {
    return this.animSlow;
  }

  setSize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
  }

  setFilled(filled: number, now?: number): void {
    const clamped = Math.max(0, Math.min(this.opts.count, filled));
    const newInt = Math.floor(clamped);
    if (now !== undefined && this.prevIntFilled >= 0 && this.mode === 'idle') {
      // 整数マス境界をまたいだものをフラッシュ登録 (skip 等で複数同時もあり得る)
      for (let i = this.prevIntFilled; i < newInt; i++) {
        this.completedFlashes.set(i, now);
      }
      // 新しいアクティブセル (= newInt) のフワッと拡大アニメを起動
      if (newInt !== this.prevIntFilled && newInt < this.opts.count) {
        this.currentEntryStart = now;
        this.currentEntryIdx = newInt;
      }
    }
    this.prevIntFilled = newInt;
    this.filled = clamped;
  }

  /**
   * CSS px (canvas 相対) からマス idx を逆算。-1 = ヒットなし or トランジション中。
   * ホバーツールチップ用。
   */
  hitTest(cssX: number, cssY: number): number {
    if (this.mode !== 'idle') return -1;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const px = cssX * this.dpr;
    const py = cssY * this.dpr;

    const padX = W * 0.08;
    const padTop = H * 0.18;
    const padBot = H * 0.18;
    const areaX = padX;
    const areaY = padTop;
    const areaW = W - padX * 2;
    const areaH = H - padTop - padBot;

    if (px < areaX || px > areaX + areaW) return -1;
    if (py < areaY || py > areaY + areaH) return -1;

    const { cols, rows } = this.chooseLayout(areaW, areaH, this.opts.count);
    const gap = Math.max(2, Math.min(areaW / cols, areaH / rows) * 0.12);
    const cellW = (areaW - gap * (cols - 1)) / cols;
    const cellH = (areaH - gap * (rows - 1)) / rows;

    const cIdx = Math.floor((px - areaX) / (cellW + gap));
    const rIdx = Math.floor((py - areaY) / (cellH + gap));
    if (cIdx < 0 || cIdx >= cols || rIdx < 0 || rIdx >= rows) return -1;

    // gap 部分にヒットしてないかチェック
    const cellLeft = areaX + cIdx * (cellW + gap);
    const cellTop = areaY + rIdx * (cellH + gap);
    if (px > cellLeft + cellW || py > cellTop + cellH) return -1;

    const idx = rIdx * cols + cIdx;
    if (idx < 0 || idx >= this.opts.count) return -1;
    return idx;
  }

  /** トランジションなしでスケールを切替 (初期化など) */
  setOptions(opts: GridOptions): void {
    this.opts = opts;
    this.mode = 'idle';
    this.prevOpts = null;
    this.completedFlashes.clear();
    this.prevIntFilled = -1;
  }

  /**
   * 起動時のシネマ intro。OUT を skip して IN phase だけを再生し、
   * マスが中央から stagger で展開する演出を起動の演出として使う。
   */
  kickIntro(now: number): void {
    this.prevOpts = null;
    this.mode = 'in';
    this.tStart = now;
  }

  /** 周期境界 (1 時間 = 1 周期完了): 60 マスを中央へ集約させて節目化 */
  triggerHourBoundary(now: number): void {
    // 既存の transition 中なら干渉を避けて何もしない
    if (this.mode !== 'idle') return;
    this.mode = 'collapse';
    this.tStart = now;
    this.completedFlashes.clear();
  }

  triggerDayBoundary(now: number): void {
    this.dayWaveStart = now;
  }

  /** 階層昇格フライトを 1 件追加 (promotion.ts の makePromotion で生成) */
  triggerPromotion(flight: PromotionFlight): void {
    this.promotions.push(flight);
  }

  /** デバッグ用: 進行中の promotion 件数 */
  get activePromotionCount(): number {
    return this.promotions.length;
  }

  /** スケール切替: OUT(旧グリッド) → IN(新グリッド) のアニメに入る */
  transitionTo(opts: GridOptions, now: number): void {
    if (this.mode !== 'idle') {
      this.mode = 'idle';
      this.prevOpts = null;
    }
    this.prevOpts = this.opts;
    this.prevFilled = this.filled;
    this.opts = opts;
    this.filled = 0;
    this.mode = 'out';
    this.tStart = now;
    // 新スケールでの境界フラッシュは IN 完了後の次回 setFilled から始める
    this.completedFlashes.clear();
    this.prevIntFilled = -1;
  }

  private chooseLayout(W: number, H: number, count: number): { cols: number; rows: number } {
    const aspect = W / H;
    let best: { cols: number; rows: number; score: number } | null = null;
    for (let rows = 1; rows <= count; rows++) {
      const cols = Math.ceil(count / rows);
      if (cols * rows < count) continue;
      const cellAspect = (W / cols) / (H / rows);
      const aspectErr = Math.abs(Math.log(cellAspect / 1.0));
      const fillErr = (cols * rows - count) * 0.05;
      const layoutErr = Math.abs(Math.log((cols / rows) / aspect)) * 0.5;
      const score = aspectErr + fillErr + layoutErr;
      if (!best || score < best.score) best = { cols, rows, score };
    }
    return best ?? { cols: count, rows: 1 };
  }

  render(now: number): void {
    const { ctx } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // 背景 (TRON: 完全黒に近い、わずかに上が青み)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#020812');
    g.addColorStop(0.6, '#000000');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // TRON 地面グリッド (薄い cyan 線、32 css px 間隔の格子)。マシン世界の床感を出す。
    this.drawAmbientGrid(W, H);

    // モード遷移チェック (animSlow を掛けた duration で判定)
    if (this.mode === 'out' && now - this.tStart >= this.ms(OUT_MS)) {
      this.mode = 'in';
      this.tStart = now;
    }
    if (this.mode === 'in' && now - this.tStart >= this.ms(IN_MS) + this.staggerDuration()) {
      this.mode = 'idle';
      this.prevOpts = null;
    }
    if (this.mode === 'collapse' && now - this.tStart >= this.ms(COLLAPSE_MS)) {
      this.mode = 'idle';
      this.prevIntFilled = Math.floor(this.filled);
      this.completedFlashes.clear();
      this.afterglowStart = now;
    }

    // ラベル: idle/in は新スケール、out は旧スケール
    const labelOpts = this.mode === 'out' && this.prevOpts ? this.prevOpts : this.opts;
    this.drawHeaderLabel(W, H, labelOpts);

    // グリッド占有領域
    const padX = W * 0.08;
    const padTop = H * 0.18;
    const padBot = H * 0.18;
    const areaX = padX;
    const areaY = padTop;
    const areaW = W - padX * 2;
    const areaH = H - padTop - padBot;

    if (this.mode === 'out' && this.prevOpts) {
      this.renderGrid(this.prevOpts, this.prevFilled, areaX, areaY, areaW, areaH, now, 'out');
    } else if (this.mode === 'in') {
      this.renderGrid(this.opts, this.filled, areaX, areaY, areaW, areaH, now, 'in');
    } else if (this.mode === 'collapse') {
      // 集約: 旧周期の "60 マス満タン状態" を中央へ吸い込ませる
      this.renderGrid(this.opts, this.opts.count, areaX, areaY, areaW, areaH, now, 'collapse');
    } else {
      this.renderGrid(this.opts, this.filled, areaX, areaY, areaW, areaH, now, 'idle');
    }

    // 下部進捗バーは idle 時のみ
    if (this.mode === 'idle') {
      this.drawProgress(W, areaX, areaW, padBot, this.filled, this.opts.count, this.opts.fillColor);
    }

    // 時刻境界エフェクト (一番前面に重ねる)
    this.drawBoundaryEffects(W, H, now);
  }

  private drawBoundaryEffects(W: number, H: number, now: number): void {
    const { ctx } = this;

    // collapse 完了後の余韻: 中央に小さい光点が広がりフェード
    const at = (now - this.afterglowStart) / this.ms(TimeGrid.AFTERGLOW_MS);
    if (at < 1 && at >= 0) {
      const cx = W / 2;
      const cy = H / 2;
      const easedR = 1 - Math.pow(1 - at, 3); // easeOutCubic
      const easedA = 1 - at * at; // 1 - easeInQuad → 前半は不透明
      const radius = (8 + easedR * 90) * this.dpr;
      ctx.save();
      ctx.shadowColor = '#fff5d0';
      ctx.shadowBlur = 50 * this.dpr;
      ctx.fillStyle = `rgba(255, 245, 208, ${easedA * 0.55})`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      // 中心の鋭い芯
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(255, 255, 255, ${easedA * 0.85})`;
      ctx.beginPath();
      ctx.arc(cx, cy, (3 + easedR * 8) * this.dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 階層昇格フライト (collapse 完了後に発火されたもの)
    this.promotions = this.promotions.filter((f) => drawPromotion(ctx, f, now, this.dpr));

    // 1 時間境界 (= 1 周期完了) は collapse mode が担当 (全マス中央集約)
    // 1 日境界: 中央から外へ広がるリセット波
    const dt = (now - this.dayWaveStart) / this.ms(TimeGrid.DAY_WAVE_MS);
    if (dt < 1) {
      const cx = W / 2;
      const cy = H / 2;
      const maxR = Math.sqrt(W * W + H * H) / 2;
      const eased = 1 - Math.pow(1 - dt, 3);
      const ringR = eased * maxR;
      // 二重リング (内側細い + 外側広い)
      ctx.save();
      ctx.strokeStyle = `rgba(255, 245, 208, ${(1 - dt) * 0.65})`;
      ctx.lineWidth = (3 + (1 - dt) * 4) * this.dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
      // ぼやけた外側ハロー (lighter)
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(242, 200, 121, ${(1 - dt) * 0.25})`;
      ctx.lineWidth = 40 * this.dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // 全画面の地のフラッシュ (前半だけ)
      if (dt < 0.5) {
        const a = (1 - dt * 2) * 0.22;
        ctx.fillStyle = `rgba(255, 245, 208, ${a})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  private staggerDuration(): number {
    // IN フェーズで、最後のマスの遅延分も含めた総時間 (animSlow 込み)
    return Math.min(this.opts.count, 60) * 5 * this.animSlow;
  }

  private renderGrid(
    opts: GridOptions,
    filled: number,
    areaX: number,
    areaY: number,
    areaW: number,
    areaH: number,
    now: number,
    phase: Mode,
  ): void {
    const { cols, rows } = this.chooseLayout(areaW, areaH, opts.count);
    const gap = Math.max(2, Math.min(areaW / cols, areaH / rows) * 0.12);
    const cellW = (areaW - gap * (cols - 1)) / cols;
    const cellH = (areaH - gap * (rows - 1)) / rows;
    // TRON: マスの角丸はほぼ無し (シャープな矩形)
    const radius = Math.min(cellW, cellH) * 0.04;

    const N = opts.count;
    const intFilled = Math.floor(filled);
    const fracFilled = filled - intFilled;

    const screenCx = this.canvas.width / 2;
    const screenCy = this.canvas.height / 2;

    // 進行中マスは描画順を最後にして z 前面に。idle 時に scale boost (1.22 倍)
    // を加えて他マスとの差別化を図り「今ここ」を一目化する。
    // 進行中入りした瞬間は scale 1.0 → 1.22 を easeOutBack でフワッと拡大 (entry アニメ)。
    const CURRENT_BOOST = 1.22;
    let entryProgress = 1; // 1 = アニメ完了 (= boost フル適用)
    if (
      this.currentEntryIdx === intFilled &&
      this.currentEntryStart > 0 &&
      now - this.currentEntryStart < this.ms(TimeGrid.ENTRY_MS)
    ) {
      const t = (now - this.currentEntryStart) / this.ms(TimeGrid.ENTRY_MS);
      entryProgress = easeOutBack(Math.max(0, Math.min(1, t)));
    }
    const dynamicBoost = 1 + (CURRENT_BOOST - 1) * entryProgress;
    let currentRender: null | {
      cellCx: number; cellCy: number; tx: number; ty: number; scale: number; alpha: number;
    } = null;

    for (let i = 0; i < N; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = areaX + c * (cellW + gap);
      const y = areaY + r * (cellH + gap);
      const cellCx = x + cellW / 2;
      const cellCy = y + cellH / 2;

      let tx = cellCx;
      let ty = cellCy;
      let scale = 1;
      let alpha = 1;

      if (phase === 'out') {
        const t = Math.min(1, (now - this.tStart) / this.ms(OUT_MS));
        const eased = easeInQuad(t);
        if (i === intFilled) {
          // 進行中マス: 中央へ引き寄せ + 拡大
          const e2 = easeOutCubic(t);
          tx = cellCx + (screenCx - cellCx) * e2;
          ty = cellCy + (screenCy - cellCy) * e2;
          scale = 1 + 1.6 * e2;
          alpha = 1;
        } else {
          // その他: 本来位置で縮小フェードアウト
          scale = 1 - eased;
          alpha = 1 - eased;
        }
      } else if (phase === 'in') {
        // stagger: マス順で 0..(N-1)*5ms 遅延 (animSlow 込み)
        const delay = i * 5 * this.animSlow;
        const local = (now - this.tStart - delay) / this.ms(IN_MS);
        const t = Math.max(0, Math.min(1, local));
        const eased = easeOutBack(t);
        // 中央から本来位置へ展開
        tx = screenCx + (cellCx - screenCx) * eased;
        ty = screenCy + (cellCy - screenCy) * eased;
        scale = Math.max(0, eased);
        alpha = Math.min(1, t * 1.5);
      } else if (phase === 'collapse') {
        // 全マスが画面中央へ吸い込まれて scale 0 + alpha 0 へ。
        const t = Math.min(1, (now - this.tStart) / this.ms(COLLAPSE_MS));
        const easedPos = easeInQuad(t);
        tx = cellCx + (screenCx - cellCx) * easedPos;
        ty = cellCy + (screenCy - cellCy) * easedPos;
        scale = Math.max(0, 1 - t);
        alpha = 1 - easeInQuad(t);
      }

      if (scale <= 0.001 || alpha <= 0.001) continue;

      // idle 時の進行中マスは保留して最後に描画 (boost は entry アニメに従う)
      if (phase === 'idle' && i === intFilled) {
        currentRender = { cellCx, cellCy, tx, ty, scale: scale * dynamicBoost, alpha };
        continue;
      }

      this.drawCellAt(
        cellCx, cellCy, cellW, cellH, radius,
        tx, ty, scale, alpha,
        i, intFilled, fracFilled, opts, now,
      );
    }

    // 進行中マスを最前面に描画 (boost 込み)
    if (currentRender) {
      this.drawCellAt(
        currentRender.cellCx, currentRender.cellCy, cellW, cellH, radius,
        currentRender.tx, currentRender.ty, currentRender.scale, currentRender.alpha,
        intFilled, intFilled, fracFilled, opts, now,
      );
    }
  }

  private drawCellAt(
    baseCx: number, baseCy: number, cellW: number, cellH: number, radius: number,
    drawCx: number, drawCy: number, scale: number, alpha: number,
    idx: number, intFilled: number, fracFilled: number, opts: GridOptions, now: number,
  ): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(drawCx, drawCy);
    ctx.scale(scale, scale);
    ctx.translate(-baseCx, -baseCy);
    this.drawCellRaw(baseCx - cellW / 2, baseCy - cellH / 2, cellW, cellH, radius, idx, intFilled, fracFilled, opts, now);
    ctx.restore();
  }

  private drawCellRaw(
    x: number, y: number, w: number, h: number, r: number,
    idx: number, intFilled: number, fracFilled: number, opts: GridOptions, now: number,
  ): void {
    const { ctx } = this;
    const isFilled = idx < intFilled;
    const isCurrent = idx === intFilled;
    const isPreview = idx === intFilled + 1;
    const fillColor = opts.fillColor;

    // TRON: 全マス共通で「線」が主役。塗りは控えめ、線の輝度で状態を表す。
    if (!isFilled && !isCurrent && !isPreview) {
      // 未塗マス: 細い線のみ。TRON のグリッド感を保つため枠線は確実に見える濃さに。
      ctx.strokeStyle = 'rgba(0, 245, 255, 0.20)';
      ctx.lineWidth = 1 * this.dpr;
      roundRect(ctx, x, y, w, h, r);
      ctx.stroke();
    }

    // Preview: 次に塗られる予告枠 (中間輝度)
    if (isPreview) {
      ctx.save();
      ctx.fillStyle = alphaCol(fillColor, 0.04);
      roundRect(ctx, x, y, w, h, r);
      ctx.fill();
      ctx.strokeStyle = alphaCol(fillColor, 0.35);
      ctx.lineWidth = 1 * this.dpr;
      roundRect(ctx, x, y, w, h, r);
      ctx.stroke();
      ctx.restore();
    }

    if (isFilled) {
      // TRON 塗り済みマス: 内部はごく薄い fill + 強い線 + glow
      ctx.save();
      ctx.fillStyle = alphaCol(fillColor, 0.10);
      roundRect(ctx, x, y, w, h, r);
      ctx.fill();
      ctx.shadowColor = fillColor;
      ctx.shadowBlur = 6 * this.dpr;
      ctx.strokeStyle = alphaCol(fillColor, 0.85);
      ctx.lineWidth = 1.2 * this.dpr;
      roundRect(ctx, x, y, w, h, r);
      ctx.stroke();
      ctx.restore();
      // 完了直後のマス: 短いハイライト + 外側に広がる波紋リング
      const flashStart = this.completedFlashes.get(idx);
      if (flashStart !== undefined) {
        const t = (now - flashStart) / this.ms(TimeGrid.FLASH_MS);
        if (t >= 1) {
          this.completedFlashes.delete(idx);
        } else {
          const cx = x + w / 2;
          const cy = y + h / 2;
          // 1) マスの上に一時的な明るい乗算 (lighter)
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = alphaCol(fillColor, (1 - t) * 0.45);
          roundRect(ctx, x, y, w, h, r);
          ctx.fill();
          ctx.restore();
          // 2) 外側に広がる波紋リング (半径は控えめにして隣接マスを侵さない範囲で)
          const eased = 1 - Math.pow(1 - t, 3);
          const baseR = Math.min(w, h) * 0.5;
          const ringR = baseR + Math.max(w, h) * 0.45 * eased;
          ctx.save();
          ctx.strokeStyle = alphaCol(fillColor, (1 - t) * 0.55);
          ctx.lineWidth = (1.2 + (1 - t) * 1.8) * this.dpr;
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    } else if (isCurrent) {
      const subs = opts.subdivisions ?? 0;
      if (subs > 0) {
        // 下位粒度を粒子で可視化 (進捗ゲージ塗りは省略、粒子の点灯数で進捗を表現)
        this.drawSubParticles(x, y, w, h, fracFilled, subs, fillColor, now);
      } else {
        // 下位粒度なし: 下→上の進捗ゲージで進行を表す (1 分モードなど)
        const fillH = h * fracFilled;
        const fillY = y + h - fillH;
        ctx.save();
        roundRect(ctx, x, y, w, h, r);
        ctx.clip();
        const g = ctx.createLinearGradient(x, fillY, x, y + h);
        g.addColorStop(0, alphaCol(fillColor, 0.95));
        g.addColorStop(1, alphaCol(shade(fillColor, -0.4), 0.85));
        ctx.fillStyle = g;
        ctx.fillRect(x, fillY, w, fillH);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(x, fillY - 0.5 * this.dpr, w, 1 * this.dpr);
        ctx.restore();
      }

      // 進行中マス共通: 脈動 + glow の輪郭
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
      ctx.save();
      ctx.shadowColor = fillColor;
      ctx.shadowBlur = (8 + pulse * 6) * this.dpr;
      ctx.strokeStyle = alphaCol(fillColor, 0.35 + pulse * 0.4);
      ctx.lineWidth = 1.2 * this.dpr;
      roundRect(ctx, x, y, w, h, r);
      ctx.stroke();
      ctx.restore();

      // 進行中マスの下に「N + unit」ラベル(例: 14h / 35m / 47s)
      // 「グリッドだけ見て今どこか」を一目化する。可読性重視で weight 700 + 白系。
      const unit = opts.unit;
      if (unit) {
        const fontSize = Math.max(11, Math.min(20, Math.min(w, h) * 0.22));
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.font = `700 ${fontSize}px ui-monospace, "SF Mono", Menlo, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        // 細い影でコントラスト確保
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 6 * this.dpr;
        ctx.fillText(`${idx}${unit}`, x + w / 2, y + h + 6 * this.dpr);
        ctx.restore();
      }
    }
  }

  private drawSubParticles(
    x: number, y: number, w: number, h: number,
    fracFilled: number, subs: number, color: string, now: number,
  ): void {
    const { ctx } = this;
    // 粒子の格子レイアウト: マスのアスペクト比に合わせて cols/rows を選ぶ
    const subAspect = w / h;
    let subCols = Math.max(1, Math.round(Math.sqrt(subs * subAspect)));
    while (subCols > 1 && Math.ceil(subs / subCols) > subs) subCols--;
    // 整列性のため、subs を割り切れる cols を優先
    const candidates = [subCols, subCols - 1, subCols + 1, subCols - 2, subCols + 2].filter(
      (c) => c > 0 && c <= subs,
    );
    for (const c of candidates) {
      if (subs % c === 0) { subCols = c; break; }
    }
    const subRows = Math.ceil(subs / subCols);

    const padIn = Math.min(w, h) * 0.14;
    const innerX = x + padIn;
    const innerY = y + padIn;
    const innerW = w - padIn * 2;
    const innerH = h - padIn * 2;
    const cellGap = Math.max(1 * this.dpr, Math.min(innerW / subCols, innerH / subRows) * 0.18);
    const cellW = (innerW - cellGap * (subCols - 1)) / subCols;
    const cellH = (innerH - cellGap * (subRows - 1)) / subRows;
    const dotR = Math.min(cellW, cellH) * 0.36;

    if (dotR < 0.5 * this.dpr) return; // 粒子が小さすぎたら描画スキップ

    const subFilled = fracFilled * subs;
    const subInt = Math.floor(subFilled);

    for (let i = 0; i < subs; i++) {
      const r = Math.floor(i / subCols);
      const c = i % subCols;
      const cx = innerX + c * (cellW + cellGap) + cellW / 2;
      const cy = innerY + r * (cellH + cellGap) + cellH / 2;

      if (i < subInt) {
        // 点灯済み
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();
      } else if (i === subInt) {
        // 進行中サブ粒子: 大きく + 派手な脈動 + 中心の白い芯で「今ここ」を強調
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.012);
        const sz = dotR * (1.1 + pulse * 0.5);
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = (8 + pulse * 10) * this.dpr;
        ctx.fillStyle = alphaCol(color, 0.7 + pulse * 0.3);
        ctx.beginPath();
        ctx.arc(cx, cy, sz, 0, Math.PI * 2);
        ctx.fill();
        // 中心の白い芯
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(255,255,255,${0.4 + pulse * 0.45})`;
        ctx.beginPath();
        ctx.arc(cx, cy, sz * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // 未点灯
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 0.8 * this.dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, dotR * 0.85, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /**
   * 背景に薄い TRON 風グリッド (細い cyan 線の格子)。中央がやや明るく、端は暗くなる
   * radial gradient で消失点感を出す。
   */
  private drawAmbientGrid(W: number, H: number): void {
    const { ctx } = this;
    const step = 32 * this.dpr;
    const cx = W / 2;
    const cy = H / 2;
    const maxDist = Math.hypot(W, H) / 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 245, 255, 1)';
    ctx.lineWidth = 0.6 * this.dpr;
    // 縦線
    for (let x = cx % step; x < W; x += step) {
      const dist = Math.abs(x - cx);
      const a = 0.14 * (1 - Math.min(1, dist / maxDist));
      ctx.globalAlpha = Math.max(0.025, a);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    // 横線
    for (let y = cy % step; y < H; y += step) {
      const dist = Math.abs(y - cy);
      const a = 0.14 * (1 - Math.min(1, dist / maxDist));
      ctx.globalAlpha = Math.max(0.025, a);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHeaderLabel(W: number, _H: number, opts: GridOptions): void {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 245, 255, 0.45)';
    ctx.font = `500 ${11 * this.dpr}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 245, 255, 0.5)';
    ctx.shadowBlur = 6 * this.dpr;
    // letter-spacing 風 (charsep を手動で広げる)
    const text = opts.scaleLabel.toUpperCase();
    ctx.fillText(text, W / 2, this.canvas.height * 0.06);
    ctx.restore();
  }

  private drawProgress(
    W: number, areaX: number, areaW: number, padBot: number,
    filled: number, N: number, color: string,
  ): void {
    const { ctx } = this;
    const barH = 1 * this.dpr;
    const y = this.canvas.height - padBot * 0.55;
    // 背景レール (細く、ほぼ透明)
    ctx.fillStyle = 'rgba(0, 245, 255, 0.08)';
    ctx.fillRect(areaX, y, areaW, barH);
    // 進捗 (発光)
    const ratio = filled / N;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * this.dpr;
    ctx.fillStyle = color;
    ctx.fillRect(areaX, y, areaW * ratio, barH);
    ctx.restore();
    // テキスト (etched)
    ctx.fillStyle = 'rgba(0, 245, 255, 0.35)';
    ctx.font = `500 ${10 * this.dpr}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${filled.toFixed(2)} / ${N}`, areaX, y + 10 * this.dpr);
    ctx.textAlign = 'right';
    ctx.fillText(`${(ratio * 100).toFixed(1)}%`, areaX + areaW, y + 10 * this.dpr);
    void W;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
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

function alphaCol(hex: string, a: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function shade(hex: string, factor: number): string {
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

function easeInQuad(t: number): number { return t * t; }
function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
