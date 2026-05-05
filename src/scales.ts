// 時間スケールの定義。3 つのスケールで「同じグリッド」を異なる単位で見る。

export type ScaleId = 'minute' | 'hour' | 'day';

export interface Scale {
  id: ScaleId;
  /** 表示マス数 */
  count: number;
  /** 1 マス分の実時間 (ms) */
  msPerCell: number;
  /** 周期全体の長さ (ms) = count × msPerCell */
  periodMs: number;
  /** 上部に出すラベル */
  label: string;
  /** 短いラベル (UI ボタン用) */
  shortLabel: string;
  /** マスの塗り色 (16進) */
  fillColor: string;
  /** 1 マス内に描く下位粒子の数 (0 で粒子なし)。進行中マスでのみ可視化 */
  subdivisions: number;
  /** 各マスが表す単位 (進行中マス下のラベル用) */
  unit: 'h' | 'm' | 's';
}

// shortLabel は「マス 1 つの単位」を直接表す: minute scale なら 1 マス=1 sec なので 'sec'。
// label は descriptive (周期 + 内訳) で aria-label / 説明用。
export const SCALES: Record<ScaleId, Scale> = {
  minute: {
    id: 'minute',
    count: 60,
    msPerCell: 1000,
    periodMs: 60_000,
    label: '1 minute · 60 seconds',
    shortLabel: 'sec',
    fillColor: '#00f5ff', // TRON cyan (sharp neon)
    subdivisions: 0, // < 1 秒は人間の認知粒度を超えるので粒子なし
    unit: 's',
  },
  hour: {
    id: 'hour',
    count: 60,
    msPerCell: 60_000,
    periodMs: 3_600_000,
    label: '1 hour · 60 minutes',
    shortLabel: 'min',
    fillColor: '#4ad8ff', // TRON deep cyan
    subdivisions: 60, // 1 分マス内に 60 秒粒子
    unit: 'm',
  },
  day: {
    id: 'day',
    count: 24,
    msPerCell: 3_600_000,
    periodMs: 86_400_000,
    label: '1 day · 24 hours',
    shortLabel: 'hour',
    fillColor: '#ff7a00', // TRON orange accent (top of hierarchy)
    subdivisions: 60, // 1 時間マス内に 60 分粒子
    unit: 'h',
  },
};

export const SCALE_ORDER: ScaleId[] = ['minute', 'hour', 'day'];

/**
 * SCALE_ORDER 上で `current` から `dir` (+1 / -1) 方向にスキャンし、
 * 最初に見つかった「current 以外の」 unlocked スケールを返す。
 * すべてロック / unlocked が current のみなら null (= 移動先なし)。
 *
 * scaleSwitch.cycle (キーボード `[` `]` / タッチ swipe) の合流ロジック。
 * DOM に依存しないので単体テスト可能。
 */
export function nextUnlockedScale(
  current: ScaleId,
  unlocked: ReadonlySet<ScaleId>,
  dir: 1 | -1,
): ScaleId | null {
  const i = SCALE_ORDER.indexOf(current);
  // step は length-1 まで (= 自分以外を全部見たら停止)。length まで回すと
  // 最後に current 自身を再評価してしまい「他に unlock されたものが無いのに
  // current を返す」誤動作になる。
  for (let step = 1; step < SCALE_ORDER.length; step++) {
    const next = SCALE_ORDER[(i + dir * step + SCALE_ORDER.length) % SCALE_ORDER.length];
    if (unlocked.has(next)) return next;
  }
  return null;
}

/** virtualMs から、当該スケールの現在の塗り目盛 (0 〜 count) を計算 */
export function filledFor(scale: Scale, virtualMs: number): number {
  // periodMs を超えた分は modulo (1 周期で 1 周ループ)
  const cycle = ((virtualMs % scale.periodMs) + scale.periodMs) % scale.periodMs;
  return cycle / scale.msPerCell;
}
