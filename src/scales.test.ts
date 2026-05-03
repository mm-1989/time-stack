import { describe, it, expect } from 'vitest';
import { filledFor, SCALES } from './scales';

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
