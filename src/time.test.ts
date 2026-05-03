import { describe, it, expect } from 'vitest';
import { VirtualClock, elapsedSinceJstMidnight, formatJstClock } from './time';

describe('VirtualClock', () => {
  it('returns initialVirtualMs at first tick (no advance)', () => {
    const clock = new VirtualClock(1, 1000, 5000);
    expect(clock.tick(1000)).toBe(5000);
  });

  it('advances by speed * delta', () => {
    const clock = new VirtualClock(2, 0, 0);
    expect(clock.tick(1000)).toBe(2000);
  });

  it('does not advance when frozen', () => {
    const clock = new VirtualClock(1, 0, 1000);
    clock.frozen = true;
    expect(clock.tick(500)).toBe(1000);
  });

  it('skip(delta) adds delta directly', () => {
    const clock = new VirtualClock(1, 0, 0);
    clock.tick(0);
    clock.skip(5000);
    expect(clock.tick(0)).toBe(5000);
  });

  it('setVirtualMs() overrides', () => {
    const clock = new VirtualClock(1, 0, 0);
    clock.tick(0);
    clock.setVirtualMs(99_999);
    expect(clock.tick(0)).toBe(99_999);
  });
});

describe('elapsedSinceJstMidnight', () => {
  it('returns ms since JST midnight', () => {
    // UTC 2024-01-01T00:00:00Z = JST 09:00:00 = 9h since JST midnight
    const utc = new Date('2024-01-01T00:00:00Z').getTime();
    expect(elapsedSinceJstMidnight(utc)).toBe(9 * 3600 * 1000);
  });

  it('wraps around at JST midnight', () => {
    // UTC 2024-01-01T15:00:00Z = JST 2024-01-02T00:00:00 = 0
    const utc = new Date('2024-01-01T15:00:00Z').getTime();
    expect(elapsedSinceJstMidnight(utc)).toBe(0);
  });
});

describe('formatJstClock', () => {
  it('formats hh:mm:ss', () => {
    const utc = new Date('2024-01-01T00:00:00Z').getTime();
    expect(formatJstClock(utc)).toBe('09:00:00');
  });

  it('zero-pads single-digit hour/min/sec', () => {
    const utc = new Date('2024-01-01T00:01:02Z').getTime(); // JST 09:01:02
    expect(formatJstClock(utc)).toBe('09:01:02');
  });
});
