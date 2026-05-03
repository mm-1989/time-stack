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
}

export const SCALES: Record<ScaleId, Scale> = {
  minute: {
    id: 'minute',
    count: 60,
    msPerCell: 1000,
    periodMs: 60_000,
    label: '1 minute · 60 seconds',
    shortLabel: '1 min',
    fillColor: '#fff5d0',
  },
  hour: {
    id: 'hour',
    count: 60,
    msPerCell: 60_000,
    periodMs: 3_600_000,
    label: '1 hour · 60 minutes',
    shortLabel: '1 hour',
    fillColor: '#f2c879',
  },
  day: {
    id: 'day',
    count: 24,
    msPerCell: 3_600_000,
    periodMs: 86_400_000,
    label: '1 day · 24 hours',
    shortLabel: '1 day',
    fillColor: '#b48b5a',
  },
};

export const SCALE_ORDER: ScaleId[] = ['minute', 'hour', 'day'];

/** virtualMs から、当該スケールの現在の塗り目盛 (0 〜 count) を計算 */
export function filledFor(scale: Scale, virtualMs: number): number {
  // periodMs を超えた分は modulo (1 周期で 1 周ループ)
  const cycle = ((virtualMs % scale.periodMs) + scale.periodMs) % scale.periodMs;
  return cycle / scale.msPerCell;
}
