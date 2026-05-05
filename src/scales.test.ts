import { describe, it, expect } from 'vitest';
import {
  filledFor,
  nextUnlockedScale,
  SCALES,
  snapshotScale,
  type ScaleId,
} from './scales';

describe('filledFor (minute scale)', () => {
  it('30 seconds → 30 cells', () => {
    expect(filledFor(SCALES.minute, 30_000)).toBe(30);
  });

  it('60 seconds → wraps to 0', () => {
    expect(filledFor(SCALES.minute, 60_000)).toBe(0);
  });

  it('handles fractional ms', () => {
    expect(filledFor(SCALES.minute, 30_500)).toBeCloseTo(30.5);
  });
});

describe('filledFor (hour scale)', () => {
  it('30 minutes → 30 cells', () => {
    expect(filledFor(SCALES.hour, 30 * 60_000)).toBe(30);
  });

  it('1 hour → wraps to 0', () => {
    expect(filledFor(SCALES.hour, 3600_000)).toBe(0);
  });
});

describe('filledFor (day scale)', () => {
  it('12 hours → 12 cells', () => {
    expect(filledFor(SCALES.day, 12 * 3600_000)).toBe(12);
  });

  it('24 hours → wraps to 0', () => {
    expect(filledFor(SCALES.day, 24 * 3600_000)).toBe(0);
  });
});

describe('filledFor (negative virtualMs)', () => {
  it('negative wraps positively (modulo)', () => {
    // -30 sec → 60 - 30 = 30 で wrapped
    expect(filledFor(SCALES.minute, -30_000)).toBe(30);
  });
});

describe('nextUnlockedScale', () => {
  const all = (...ids: ScaleId[]): ReadonlySet<ScaleId> => new Set(ids);

  it('全 unlocked: minute → +1 → hour', () => {
    expect(nextUnlockedScale('minute', all('minute', 'hour', 'day'), 1)).toBe('hour');
  });

  it('全 unlocked: day → +1 → minute (循環)', () => {
    expect(nextUnlockedScale('day', all('minute', 'hour', 'day'), 1)).toBe('minute');
  });

  it('全 unlocked: minute → -1 → day (循環)', () => {
    expect(nextUnlockedScale('minute', all('minute', 'hour', 'day'), -1)).toBe('day');
  });

  it('hour ロック中: minute → +1 → day (hour を飛ばす)', () => {
    expect(nextUnlockedScale('minute', all('minute', 'day'), 1)).toBe('day');
  });

  it('hour と day ロック中: minute → +1 → null (移動先なし)', () => {
    expect(nextUnlockedScale('minute', all('minute'), 1)).toBe(null);
  });

  it('progressive unlock 序盤: minute のみ unlock、両方向ともに null', () => {
    expect(nextUnlockedScale('minute', all('minute'), 1)).toBe(null);
    expect(nextUnlockedScale('minute', all('minute'), -1)).toBe(null);
  });

  it('現在地もロック中の異常系でも crash しない', () => {
    // 通常起こらないが、レース等で current が unlock 集合外になっても安全に動く
    expect(nextUnlockedScale('day', all('minute'), 1)).toBe('minute');
  });
});

describe('snapshotScale (month / 暦アンカー)', () => {
  it('1 月 1 日 0:00 は filled=0, count=31', () => {
    const ms = new Date(2026, 0, 1, 0, 0, 0).getTime();
    const snap = snapshotScale(SCALES.month, 0, ms);
    expect(snap.count).toBe(31);
    expect(snap.filled).toBeCloseTo(0, 5);
  });

  it('1 月 15 日 12:00 は filled=14.5 (15 日目の半分)', () => {
    const ms = new Date(2026, 0, 15, 12, 0, 0).getTime();
    const snap = snapshotScale(SCALES.month, 0, ms);
    expect(snap.count).toBe(31);
    expect(snap.filled).toBeCloseTo(14.5, 3);
  });

  it('2 月は count=28 (うるう年でない 2026)', () => {
    const ms = new Date(2026, 1, 1).getTime();
    const snap = snapshotScale(SCALES.month, 0, ms);
    expect(snap.count).toBe(28);
  });

  it('2 月は count=29 (うるう年 2024)', () => {
    const ms = new Date(2024, 1, 1).getTime();
    const snap = snapshotScale(SCALES.month, 0, ms);
    expect(snap.count).toBe(29);
  });

  it('4 月は count=30', () => {
    const ms = new Date(2026, 3, 15).getTime();
    const snap = snapshotScale(SCALES.month, 0, ms);
    expect(snap.count).toBe(30);
  });
});

describe('snapshotScale (year / 暦アンカー)', () => {
  it('1 月 1 日 0:00 は filled=0, count=12', () => {
    const ms = new Date(2026, 0, 1).getTime();
    const snap = snapshotScale(SCALES.year, 0, ms);
    expect(snap.count).toBe(12);
    expect(snap.filled).toBeCloseTo(0, 5);
  });

  it('7 月 1 日 0:00 は filled=6.0 (上半期終了)', () => {
    const ms = new Date(2026, 6, 1, 0, 0, 0).getTime();
    const snap = snapshotScale(SCALES.year, 0, ms);
    expect(snap.filled).toBeCloseTo(6.0, 3);
  });

  it('12 月 31 日 終わり頃は filled が 11.99 付近 (12 を越えない)', () => {
    const ms = new Date(2026, 11, 31, 23, 59, 59).getTime();
    const snap = snapshotScale(SCALES.year, 0, ms);
    expect(snap.filled).toBeGreaterThanOrEqual(11);
    expect(snap.filled).toBeLessThan(12);
  });
});

describe('snapshotScale (resolve なしのスケール)', () => {
  it('minute は静的 count + filledFor 等価', () => {
    const snap = snapshotScale(SCALES.minute, 30_000, Date.now());
    expect(snap.count).toBe(60);
    expect(snap.filled).toBe(30);
  });
});
