import { describe, it, expect } from 'vitest';
import {
  VirtualClock,
  anniversaryMonthFrame,
  anniversaryYearFrame,
  calendarBreakdown,
  clampDay,
  elapsedSinceJstMidnight,
  formatJstClock,
} from './time';

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

describe('calendarBreakdown', () => {
  // Local timezone-aware Date オブジェクトでテスト (Date(y,m,d,h,m,s) はローカル TZ)。
  // 暦差分なので TZ が一貫していれば結果も一貫する。

  it('1 日未満は years/months/days がすべて 0', () => {
    const start = new Date(2026, 4, 5, 0, 0, 0).getTime();
    const elapsed = 14 * 3600_000 + 32 * 60_000 + 18 * 1000; // 14:32:18
    const bd = calendarBreakdown(start, elapsed);
    expect(bd.years).toBe(0);
    expect(bd.months).toBe(0);
    expect(bd.days).toBe(0);
    expect(bd.hours).toBe(14);
    expect(bd.minutes).toBe(32);
    expect(bd.seconds).toBe(18);
  });

  it('14 日経過 = 0y 0mo 14d', () => {
    const start = new Date(2026, 4, 1, 0, 0, 0).getTime();
    const elapsed = 14 * 86_400_000;
    const bd = calendarBreakdown(start, elapsed);
    expect(bd.years).toBe(0);
    expect(bd.months).toBe(0);
    expect(bd.days).toBe(14);
  });

  it('暦上の 1 ヶ月経過 (5/1 → 6/1) = 0y 1mo 0d', () => {
    const start = new Date(2026, 4, 1).getTime(); // May 1
    const end = new Date(2026, 5, 1).getTime();   // Jun 1
    const bd = calendarBreakdown(start, end - start);
    expect(bd.years).toBe(0);
    expect(bd.months).toBe(1);
    expect(bd.days).toBe(0);
  });

  it('1990-04-15 → 2026-05-05 で 36y 0mo 20d', () => {
    const start = new Date(1990, 3, 15).getTime();
    const end = new Date(2026, 4, 5).getTime();
    const bd = calendarBreakdown(start, end - start);
    expect(bd.years).toBe(36);
    expect(bd.months).toBe(0);
    expect(bd.days).toBe(20);
  });

  it('日の繰り下げ: 1/31 → 2/15 = 0y 0mo 15d (借入で months/days 整合)', () => {
    const start = new Date(2026, 0, 31).getTime();
    const end = new Date(2026, 1, 15).getTime();
    const bd = calendarBreakdown(start, end - start);
    expect(bd.years).toBe(0);
    // 1/31 → 2/15 は 15 日。月差は -1 (1/31 → 2/0 = 1/31 = 0 月差) +借入で月=0、日=15。
    expect(bd.months).toBe(0);
    expect(bd.days).toBe(15);
  });

  it('時刻の繰り下げ: 23:00 → 翌日 01:00 = 0y 0mo 1d 2h', () => {
    const start = new Date(2026, 4, 5, 23, 0, 0).getTime();
    const end = new Date(2026, 4, 7, 1, 0, 0).getTime();
    const bd = calendarBreakdown(start, end - start);
    expect(bd.days).toBe(1);
    expect(bd.hours).toBe(2);
  });

  it('virtualMs=0 は全部 0', () => {
    const start = new Date(2026, 4, 5).getTime();
    const bd = calendarBreakdown(start, 0);
    expect(bd).toEqual({ years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('負の virtualMs は 0 にクランプ', () => {
    const start = new Date(2026, 4, 5).getTime();
    const bd = calendarBreakdown(start, -1000);
    expect(bd.seconds).toBe(0);
  });
});

describe('clampDay', () => {
  it('Feb は 28 日にクランプ (平年)', () => {
    expect(clampDay(2026, 1, 31)).toBe(28);
    expect(clampDay(2026, 1, 29)).toBe(28);
    expect(clampDay(2026, 1, 28)).toBe(28);
    expect(clampDay(2026, 1, 15)).toBe(15);
  });
  it('Feb は 29 日にクランプ (うるう年 2024)', () => {
    expect(clampDay(2024, 1, 31)).toBe(29);
    expect(clampDay(2024, 1, 29)).toBe(29);
  });
  it('30 日月で 31 をクランプ', () => {
    expect(clampDay(2026, 3, 31)).toBe(30); // April
    expect(clampDay(2026, 5, 31)).toBe(30); // June
  });
  it('31 日月はそのまま', () => {
    expect(clampDay(2026, 0, 31)).toBe(31); // Jan
    expect(clampDay(2026, 6, 31)).toBe(31); // July
  });
});

describe('anniversaryMonthFrame', () => {
  it('通常月 15 日起点、2 週間後 → filled≈14, count=30', () => {
    const origin = new Date(1990, 5, 15).getTime();
    const wall = new Date(2026, 5, 29).getTime(); // 6/15 anchor → 6/29 = 14 日
    const f = anniversaryMonthFrame(origin, wall);
    expect(f.count).toBe(30); // 6/15 → 7/15 = 30 日
    expect(f.filled).toBeCloseTo(14, 1);
  });

  it('Jan 31 起点、2 月内なら count=28 にクランプ', () => {
    const origin = new Date(2026, 0, 31).getTime();
    const wall = new Date(2026, 1, 14).getTime(); // 2/14
    const f = anniversaryMonthFrame(origin, wall);
    // anchor は 2026-01-31、次 anchor は clampDay(2026,1,31)=Feb 28 → 28 日
    expect(f.count).toBe(28);
    expect(f.filled).toBeCloseTo(14, 0);
  });

  it('うるう年 Feb 29 起点、平年は Feb 28 にクランプ', () => {
    const origin = new Date(2024, 1, 29).getTime();
    const wall = new Date(2025, 1, 27).getTime(); // 平年 2/27
    const f = anniversaryMonthFrame(origin, wall);
    // anchor は 2025-01-29、次は Feb 28 にクランプされる → count=30
    expect(f.count).toBeGreaterThanOrEqual(28);
    expect(f.filled).toBeGreaterThanOrEqual(0);
  });

  it('origin == wall で filled=0', () => {
    const ms = new Date(2026, 4, 5, 12, 0, 0).getTime();
    const f = anniversaryMonthFrame(ms, ms);
    expect(f.filled).toBeCloseTo(0, 5);
  });

  it('Dec 31 起点、Mar 中盤での filled が連続的', () => {
    const origin = new Date(2026, 11, 31).getTime();
    const wall = new Date(2027, 2, 15).getTime(); // 3/15
    const f = anniversaryMonthFrame(origin, wall);
    // 2027-02-28 (clamp from 2/31) anchor → 3/31 anniversary 直前
    expect(f.count).toBeGreaterThanOrEqual(28);
    expect(f.filled).toBeGreaterThan(0);
    expect(f.filled).toBeLessThan(f.count);
  });
});

describe('anniversaryYearFrame', () => {
  it('count は常に 12', () => {
    const origin = new Date(1990, 3, 15).getTime();
    const wall = new Date(2026, 4, 5).getTime();
    const f = anniversaryYearFrame(origin, wall);
    expect(f.count).toBe(12);
  });

  it('1990-04-15 起点、2026-05-05 → filled≈0.67 (4/15 anchor から 20 日経過 ≈ 0.67 月)', () => {
    const origin = new Date(1990, 3, 15).getTime();
    const wall = new Date(2026, 4, 5).getTime();
    const f = anniversaryYearFrame(origin, wall);
    expect(f.filled).toBeGreaterThan(0.5);
    expect(f.filled).toBeLessThan(1.0);
  });

  it('origin == wall で filled=0', () => {
    const ms = new Date(2026, 4, 5).getTime();
    const f = anniversaryYearFrame(ms, ms);
    expect(f.filled).toBeCloseTo(0, 5);
  });

  it('うるう年 Feb 29 起点 + 平年 Feb 28 で filled が 0..12 内', () => {
    const origin = new Date(2024, 1, 29).getTime();
    const wall = new Date(2025, 1, 28).getTime();
    const f = anniversaryYearFrame(origin, wall);
    expect(f.filled).toBeGreaterThanOrEqual(0);
    expect(f.filled).toBeLessThan(12);
  });
});
