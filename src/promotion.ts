// 階層昇格フライト: 集約後の光点が「上位スケールバッジ」へ弧軌道で飛んでいくアニメ。
// canvas (光) と DOM (バッジ) を視覚的に繋ぎ、「この 1 周期が上位の 1 マスに昇格した」を読み解かせる。

export interface PromotionFlight {
  startTime: number;
  duration: number;
  startX: number; // canvas pixel
  startY: number;
  /** 飛行中も毎フレーム取得 (リサイズ・スケール切替で位置が動くため) */
  getTargetCanvasXY: () => { x: number; y: number } | null;
  onArrive: () => void;
  arrived: boolean;
  trail: Array<{ x: number; y: number }>;
}

export function makePromotion(opts: {
  startTime: number;
  startX: number;
  startY: number;
  getTargetCanvasXY: () => { x: number; y: number } | null;
  onArrive: () => void;
  duration?: number;
}): PromotionFlight {
  return {
    startTime: opts.startTime,
    duration: opts.duration ?? 800,
    startX: opts.startX,
    startY: opts.startY,
    getTargetCanvasXY: opts.getTargetCanvasXY,
    onArrive: opts.onArrive,
    arrived: false,
    trail: [],
  };
}

/** 飛行を 1 フレーム描画。戻り値: false なら完了 (呼び出し側が配列から削除する) */
export function drawPromotion(
  ctx: CanvasRenderingContext2D,
  flight: PromotionFlight,
  now: number,
  dpr: number,
): boolean {
  const linearT = (now - flight.startTime) / flight.duration;
  if (linearT >= 1) {
    if (!flight.arrived) {
      flight.arrived = true;
      flight.onArrive();
    }
    return false;
  }
  if (linearT < 0) return true; // まだ開始時刻前 (描画スキップ)

  const target = flight.getTargetCanvasXY();
  if (!target) return false;

  const e = 1 - Math.pow(1 - linearT, 3); // easeOutCubic
  const sx = flight.startX;
  const sy = flight.startY;
  const tx = target.x;
  const ty = target.y;
  // 二次ベジエ。制御点を「sy と ty の中間 + 上空 80px」に置いて軌道を上に膨らませる
  const ctrlX = (sx + tx) / 2;
  const ctrlY = Math.min(sy, ty) - 80 * dpr;
  const omt = 1 - e;
  const x = omt * omt * sx + 2 * omt * e * ctrlX + e * e * tx;
  const y = omt * omt * sy + 2 * omt * e * ctrlY + e * e * ty;

  // trail 更新 (古いポイントを順次破棄)
  flight.trail.push({ x, y });
  if (flight.trail.length > 14) flight.trail.shift();

  // trail 描画 (古いほど薄く細く)
  for (let i = 0; i < flight.trail.length - 1; i++) {
    const p0 = flight.trail[i];
    const p1 = flight.trail[i + 1];
    const a = (i / flight.trail.length) * 0.5;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 245, 208, ${a})`;
    ctx.lineWidth = (1 + i * 0.25) * dpr;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#fff5d0';
    ctx.shadowBlur = 6 * dpr;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
  }

  // ヘッド: 光点 (scale 1 → 0.4 で縮小)
  const headScale = 1 - e * 0.6;
  ctx.save();
  ctx.shadowColor = '#fff5d0';
  ctx.shadowBlur = 30 * dpr;
  ctx.fillStyle = `rgba(255, 245, 208, ${1 - e * 0.4})`;
  ctx.beginPath();
  ctx.arc(x, y, 9 * dpr * headScale, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(255, 255, 255, ${1 - e * 0.3})`;
  ctx.beginPath();
  ctx.arc(x, y, 3.5 * dpr * headScale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return true;
}
