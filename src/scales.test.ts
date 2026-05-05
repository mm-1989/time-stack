import { describe, it, expect } from 'vitest';
import {
  filledFor,
  findCountdownNaturalScale,
  lockedCountdownScales,
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

describe('snapshotScale (ctx による mode 分岐)', () => {
  // 共通: 1990-04-15 起点、2026-05-05 を wallMs に
  const customCtx = {
    originMs: new Date(1990, 3, 15).getTime(),
    originMode: 'custom' as const,
  };
  const wallMs = new Date(2026, 4, 5, 12, 0, 0).getTime();

  it('ctx 省略 → calendar (現状互換) で month は当月の日数', () => {
    const snap = snapshotScale(SCALES.month, 0, wallMs);
    // 2026-05 は 31 日
    expect(snap.count).toBe(31);
    // 5/5 12:00 → filled = 4 + 0.5 = 4.5
    expect(snap.filled).toBeCloseTo(4.5, 1);
  });

  it('originMode=now → calendar (互換)', () => {
    const snap = snapshotScale(SCALES.month, 0, wallMs, {
      originMs: wallMs - 12 * 3600_000,
      originMode: 'now',
    });
    expect(snap.count).toBe(31);
    expect(snap.filled).toBeCloseTo(4.5, 1);
  });

  it('originMode=custom → anniversary (4/15 anchor から 20 日)', () => {
    const snap = snapshotScale(SCALES.month, 0, wallMs, customCtx);
    expect(snap.count).toBe(30); // 4/15 → 5/15 = 30 日
    expect(snap.filled).toBeGreaterThan(19);
    expect(snap.filled).toBeLessThan(21);
  });

  it('year scale: ctx 省略 → calendar (5月 = filled≈4.x)', () => {
    const snap = snapshotScale(SCALES.year, 0, wallMs);
    expect(snap.count).toBe(12);
    expect(snap.filled).toBeGreaterThan(4);
    expect(snap.filled).toBeLessThan(5);
  });

  it('year scale: originMode=custom → anniversary (4/15 anchor から 20 日 ≈ 0.67 月)', () => {
    const snap = snapshotScale(SCALES.year, 0, wallMs, customCtx);
    expect(snap.count).toBe(12);
    expect(snap.filled).toBeGreaterThan(0.5);
    expect(snap.filled).toBeLessThan(1.0);
  });

  it('originMode=countdown → calendar 計算 (anniversary 不使用) かつ filled が反転', () => {
    const snap = snapshotScale(SCALES.month, 0, wallMs, {
      ...customCtx,
      originMode: 'countdown',
    });
    expect(snap.count).toBe(31);
    // calendar mode の filled = 4.5 (5/5 12:00) → countdown 反転で count - 4.5 = 26.5
    expect(snap.filled).toBeCloseTo(26.5, 1);
  });
});

describe('snapshotScale (countdown sand timer)', () => {
  const wallMs = new Date(2026, 4, 5, 12, 0, 0).getTime();

  it('countdown mode で minute scale: filled = 60 - 30 = 30', () => {
    // virtualMs=30s → calendar mode で filled=30。countdown 反転で 60-30=30 (この場合同値だが)
    const snap = snapshotScale(SCALES.minute, 30_000, wallMs, {
      originMs: wallMs,
      originMode: 'countdown',
    });
    expect(snap.count).toBe(60);
    expect(snap.filled).toBe(30);
  });

  it('countdown mode で minute scale: virtualMs=10s → filled=50 (反転)', () => {
    const snap = snapshotScale(SCALES.minute, 10_000, wallMs, {
      originMs: wallMs,
      originMode: 'countdown',
    });
    expect(snap.filled).toBe(50);
  });

  it('countdown mode で virtualMs=0 → filled = count (満タン)', () => {
    const snap = snapshotScale(SCALES.minute, 0, wallMs, {
      originMs: wallMs,
      originMode: 'countdown',
    });
    expect(snap.filled).toBe(60);
  });

  it('countdown mode で virtualMs=periodMs (1 周分) → filled=count (modulo で 0 → 反転で count)', () => {
    // 60s elapsed = 1 minute = 0 second of new cycle, calendar filled=0, countdown=count-0=count
    const snap = snapshotScale(SCALES.minute, 60_000, wallMs, {
      originMs: wallMs,
      originMode: 'countdown',
    });
    expect(snap.filled).toBe(60);
  });

  it('countdown mode + custom origin で month: anniversary 計算結果が反転', () => {
    // 1990-04-15 起点、now 2026-05-05 → custom anchor 2026-04-15 から 20 日経過
    // calendar (anniversary) の filled=20、countdown 反転で count(30)-20=10
    const snap = snapshotScale(SCALES.month, 0, wallMs, {
      originMs: new Date(1990, 3, 15).getTime(),
      originMode: 'countdown',
    });
    // anniversary 計算は countdown では無効なので calendar 計算に fallback。
    // 5/5 12:00 → calendar filled=4.5、count=31、反転=26.5
    expect(snap.count).toBe(31);
    expect(snap.filled).toBeCloseTo(26.5, 1);
  });

  it('countdown mode で originMode 指定なし → 反転されない (回帰互換)', () => {
    const snap = snapshotScale(SCALES.minute, 10_000, wallMs);
    // ctx 省略 → calendar 累積、filled=10
    expect(snap.filled).toBe(10);
  });

  it('countdown mode で year scale: 反転確認', () => {
    // 5/5 → calendar filled = 4.x (5月、month idx=4)、countdown 反転 = 12-4.x ≈ 7.x
    const snap = snapshotScale(SCALES.year, 0, wallMs, {
      originMs: wallMs,
      originMode: 'countdown',
    });
    expect(snap.count).toBe(12);
    expect(snap.filled).toBeGreaterThan(7);
    expect(snap.filled).toBeLessThan(8);
  });

  it('countdown mode で filled が負にならない (clamped to 0)', () => {
    // 万一 base.filled > base.count となっても 0 で clamp
    // 通常は起こらないが防御的テスト
    const snap = snapshotScale(SCALES.minute, 0, wallMs, {
      originMs: wallMs,
      originMode: 'countdown',
    });
    expect(snap.filled).toBeGreaterThanOrEqual(0);
  });
});

describe('findCountdownNaturalScale', () => {
  it('30 sec → minute (60s period が初めて total を上回る)', () => {
    expect(findCountdownNaturalScale(30 * 1000)).toBe('minute');
  });
  it('30 min → hour (1h period が初めて total を上回る)', () => {
    expect(findCountdownNaturalScale(30 * 60_000)).toBe('hour');
  });
  it('12 h → day', () => {
    expect(findCountdownNaturalScale(12 * 3_600_000)).toBe('day');
  });
  it('5 d → month (30d period が初めて total を上回る)', () => {
    expect(findCountdownNaturalScale(5 * 86_400_000)).toBe('month');
  });
  it('29 d → month (約 30d periodがちょうど超える)', () => {
    expect(findCountdownNaturalScale(29 * 86_400_000)).toBe('month');
  });
  it('1 year (365d) → year', () => {
    expect(findCountdownNaturalScale(365 * 86_400_000)).toBe('year');
  });
  it('1 year ぴったり (= year period) → year (period >= total)', () => {
    expect(findCountdownNaturalScale(SCALES.year.periodMs)).toBe('year');
  });
  it('5 年 (year period 超え) → null (natural なし、全 scale per-cycle)', () => {
    expect(findCountdownNaturalScale(5 * 365 * 86_400_000)).toBe(null);
  });
  it('total <= 0 → null', () => {
    expect(findCountdownNaturalScale(0)).toBe(null);
    expect(findCountdownNaturalScale(-1000)).toBe(null);
  });
});

describe('lockedCountdownScales', () => {
  it('natural=null → 空集合 (lock なし)', () => {
    expect(Array.from(lockedCountdownScales(null))).toEqual([]);
  });
  it('natural=minute → hour/day/month/year ロック', () => {
    expect(Array.from(lockedCountdownScales('minute')).sort()).toEqual(
      ['day', 'hour', 'month', 'year'].sort(),
    );
  });
  it('natural=month → year のみロック', () => {
    expect(Array.from(lockedCountdownScales('month'))).toEqual(['year']);
  });
  it('natural=year → 何もロックしない (year が最大)', () => {
    expect(Array.from(lockedCountdownScales('year'))).toEqual([]);
  });
});

describe('snapshotScale (countdown natural scale 上書き)', () => {
  const wallMs = new Date(2026, 4, 5, 12, 0, 0).getTime();
  const ctxBase = (override: Partial<Parameters<typeof snapshotScale>[3]> = {}) => ({
    originMode: 'countdown' as const,
    originMs: wallMs,
    countdownTotalMs: 29 * 86_400_000,
    countdownRemainingMs: 29 * 86_400_000,
    countdownNaturalScale: 'month' as ScaleId,
    ...override,
  });

  it('natural=month、29日 countdown で count=29、filled=29 (開始直後)', () => {
    const snap = snapshotScale(SCALES.month, 0, wallMs, ctxBase());
    expect(snap.count).toBe(29);
    expect(snap.filled).toBeCloseTo(29, 5);
  });

  it('natural=month、半分経過で filled が 14.5 (= 14d 12h 残)', () => {
    const snap = snapshotScale(SCALES.month, 0, wallMs, ctxBase({
      countdownRemainingMs: 14.5 * 86_400_000,
    }));
    expect(snap.count).toBe(29);
    expect(snap.filled).toBeCloseTo(14.5, 3);
  });

  it('natural=month、target 通過で filled=0', () => {
    const snap = snapshotScale(SCALES.month, 0, wallMs, ctxBase({
      countdownRemainingMs: 0,
    }));
    expect(snap.filled).toBe(0);
  });

  it('natural scale で remaining > total になったら count に clamp', () => {
    const snap = snapshotScale(SCALES.month, 0, wallMs, ctxBase({
      countdownRemainingMs: 100 * 86_400_000, // 100 日 (異常値)
    }));
    expect(snap.filled).toBeLessThanOrEqual(snap.count);
  });

  it('non-natural scale (例: day) は countdown 反転 (per-cycle drain) のまま', () => {
    // day scale: virtualMs=3h で base.filled=3、countdown invert で 24-3=21
    const snap = snapshotScale(SCALES.day, 3 * 3_600_000, wallMs, ctxBase());
    expect(snap.count).toBe(24);
    expect(snap.filled).toBe(21);
  });

  it('countdownNaturalScale が ctx に無いときは natural override されない', () => {
    const snap = snapshotScale(SCALES.month, 0, wallMs, {
      originMode: 'countdown',
      originMs: wallMs,
      // countdownNaturalScale 未指定
    });
    // 通常の countdown 反転 (per-cycle): May は 31 日、5/5 12:00 → calendar filled=4.5
    // → countdown invert = 31 - 4.5 = 26.5
    expect(snap.count).toBe(31);
    expect(snap.filled).toBeCloseTo(26.5, 1);
  });
});
