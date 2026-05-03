// 時間スケールの定義。3 つのスケールで「同じグリッド」を異なる単位で見る。

export type ScaleId = 'minute' | 'hour' | 'day' | 'week';

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
  unit: 'h' | 'm' | 's' | 'd';
}

export const SCALES: Record<ScaleId, Scale> = {
  minute: {
    id: 'minute',
    count: 60,
    msPerCell: 1000,
    periodMs: 60_000,
    label: '1 minute · 60 seconds',
    shortLabel: '1 min',
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
    shortLabel: '1 hour',
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
    shortLabel: '1 day',
    fillColor: '#ff7a00', // TRON orange accent
    subdivisions: 60, // 1 時間マス内に 60 分粒子
    unit: 'h',
  },
  week: {
    id: 'week',
    count: 7,
    msPerCell: 86_400_000, // 1 day
    periodMs: 7 * 86_400_000,
    label: '1 week · 7 days',
    shortLabel: '1 week',
    fillColor: '#ff4a00', // TRON deeper orange (top of hierarchy)
    subdivisions: 24, // 1 日マス内に 24 時間粒子
    unit: 'd',
  },
};

export const SCALE_ORDER: ScaleId[] = ['minute', 'hour', 'day', 'week'];

/** virtualMs から、当該スケールの現在の塗り目盛 (0 〜 count) を計算 */
export function filledFor(scale: Scale, virtualMs: number): number {
  // periodMs を超えた分は modulo (1 周期で 1 周ループ)
  const cycle = ((virtualMs % scale.periodMs) + scale.periodMs) % scale.periodMs;
  return cycle / scale.msPerCell;
}
