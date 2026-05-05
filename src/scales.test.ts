import { describe, it, expect } from 'vitest';
import { filledFor, nextUnlockedScale, SCALES, type ScaleId } from './scales';

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
