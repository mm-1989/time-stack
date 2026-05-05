import { describe, it, expect } from 'vitest';
import { formatCountdownRemain } from './hud';

describe('formatCountdownRemain', () => {
  // 基準: wallMs に固定値、remainingMs を指定して期待文字列を検証。
  // calendarBreakdown 経由で暦正確のはずなので、月長変動・うるう年も含めてチェック。
  const wall = new Date(2026, 4, 5, 12, 0, 0).getTime(); // 2026-05-05 12:00

  it('≤ 0 ms → 空文字列 (REACHED は caller 側で表示)', () => {
    expect(formatCountdownRemain(0, wall)).toBe('');
    expect(formatCountdownRemain(-1000, wall)).toBe('');
  });

  it('< 1 日: HH:MM:SS 形式', () => {
    // remaining = 14h 32m 18s
    const ms = (14 * 3600 + 32 * 60 + 18) * 1000;
    expect(formatCountdownRemain(ms, wall)).toBe('14:32:18');
  });

  it('< 1 日 (短): 0 でゼロパディング', () => {
    const ms = (1 * 3600 + 5 * 60 + 9) * 1000;
    expect(formatCountdownRemain(ms, wall)).toBe('01:05:09');
  });

  it('1-29 日: "Nd HH:MM" 形式', () => {
    // wall=2026-05-05 12:00、remaining = 5d 6h 30m
    // → end = 2026-05-10 18:30
    // calendarBreakdown(wall, remaining) → 0y 0mo 5d 6h 30m
    const ms = (5 * 86400 + 6 * 3600 + 30 * 60) * 1000;
    expect(formatCountdownRemain(ms, wall)).toBe('5D 06H 30M');
  });

  it('1-11 ヶ月: "Mmo Dd HH" 形式', () => {
    // wall=2026-05-05、target=2026-09-15 → 4mo 10d
    const target = new Date(2026, 8, 15, 12, 0, 0).getTime();
    const ms = target - wall;
    expect(formatCountdownRemain(ms, wall)).toBe('4MO 10D 00H');
  });

  it('≥ 1 年: "Ny Mmo Dd" 形式 (正確な暦差分)', () => {
    // wall=2026-05-05、target=2030-01-01
    // → 3y 7mo 27d (4y - 4mo 4d 繰り下げ後)
    const target = new Date(2030, 0, 1, 12, 0, 0).getTime();
    const ms = target - wall;
    expect(formatCountdownRemain(ms, wall)).toBe('3Y 7MO 27D');
  });

  it('うるう年跨ぎ: 平年 2/28 → うるう年 3/1 で 1 日扱い', () => {
    // wall=2025-02-27、target=2025-03-01 → 2 日
    const start = new Date(2025, 1, 27, 0, 0, 0).getTime();
    const target = new Date(2025, 2, 1, 0, 0, 0).getTime();
    expect(formatCountdownRemain(target - start, start)).toBe('2D 00H 00M');
  });

  it('うるう年 2/29 を含む遠 future', () => {
    // wall=2024-02-28 (leap)、target=2024-03-01 → 2 日 (2/29 含む)
    const start = new Date(2024, 1, 28, 0, 0, 0).getTime();
    const target = new Date(2024, 2, 1, 0, 0, 0).getTime();
    expect(formatCountdownRemain(target - start, start)).toBe('2D 00H 00M');
  });

  it('月末日 31 日 → 翌 30 日月跨ぎ', () => {
    // wall=2026-03-31、target=2026-05-31 → 暦差分 2mo 0d
    const start = new Date(2026, 2, 31, 0, 0, 0).getTime();
    const target = new Date(2026, 4, 31, 0, 0, 0).getTime();
    expect(formatCountdownRemain(target - start, start)).toBe('2MO 0D 00H');
  });

  it('1 ヶ月境界ぴったり', () => {
    // wall=2026-05-05、target=2026-06-05 → 1mo 0d 0h
    const start = new Date(2026, 4, 5, 12, 0, 0).getTime();
    const target = new Date(2026, 5, 5, 12, 0, 0).getTime();
    expect(formatCountdownRemain(target - start, start)).toBe('1MO 0D 00H');
  });

  it('1 年境界ぴったり', () => {
    // wall=2026-05-05、target=2027-05-05 → 1y 0mo 0d
    const start = new Date(2026, 4, 5, 12, 0, 0).getTime();
    const target = new Date(2027, 4, 5, 12, 0, 0).getTime();
    expect(formatCountdownRemain(target - start, start)).toBe('1Y 0MO 0D');
  });

  it('1 日ぴったり: "1D 00H 00M"', () => {
    const ms = 86400 * 1000;
    expect(formatCountdownRemain(ms, wall)).toBe('1D 00H 00M');
  });

  it('1 秒未満: 00:00:00', () => {
    expect(formatCountdownRemain(500, wall)).toBe('00:00:00');
  });
});
