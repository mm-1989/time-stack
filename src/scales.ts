// 時間スケールの定義。複数のスケールで「同じグリッド」を異なる単位で見る。
// minute/hour/day は単純循環 (固定 count + msPerCell)、month/year は origin.mode に
// 応じて wall-clock anchored (NOW/countdown) か elapsed anchored (custom = anniversary 起点)
// を切り替えて resolve() で count + filled を返す。

import {
  anniversaryMonthFrame,
  anniversaryYearFrame,
} from './time';

export type ScaleId = 'minute' | 'hour' | 'day' | 'month' | 'year';

/** スケールの 1 フレーム分のスナップショット。grid 描画と進捗判定に使う */
export interface ScaleSnapshot {
  /** 描画するマス数。month のように月長で変わるものは毎フレーム最新値を返す */
  count: number;
  /** 0 〜 count の塗り目盛 (小数あり)。下位粒度の補間も内包 */
  filled: number;
}

/**
 * resolve() 呼び出し時の文脈。origin が custom モードかどうかで月/年の anchor が
 * 変わる (custom → anniversary 起点 / それ以外 → 壁時計暦)。
 *
 * countdown mode 用に追加情報も載せる:
 *  - countdownNaturalScale: countdown 全期間を 1 サイクル化する scale id
 *  - countdownTotalMs / countdownRemainingMs: その scale の count/filled 算出に使う
 *
 * 省略時 (= ctx 自体が undefined) は origin 不明として calendar 計算にフォールバック。
 * 既存テスト (ctx 省略) の挙動を保つため optional。
 */
export interface ResolveContext {
  /** origin 日時の UTC ms。anniversary 計算の起点。 */
  originMs?: number;
  /** origin のモード。'custom' のときのみ anniversary 計算が走る。 */
  originMode?: 'now' | 'custom' | 'countdown';
  /**
   * countdown mode で「全期間を 1 サイクルとして見せる」natural scale。
   * この scale だけは count/filled を countdown 直接マップ (= per-cycle drain ではなく
   * 全 countdown を 1 cell ごとの単位で drain) で上書きする。
   */
  countdownNaturalScale?: ScaleId;
  /** countdown 全期間 (= target - sessionStart)。natural scale の count 算出用 */
  countdownTotalMs?: number;
  /** 現在の countdown 残時間 (= target - now)。natural scale の filled 算出用 */
  countdownRemainingMs?: number;
}

/**
 * countdown total から natural scale を決定する純関数。
 * 「period >= total」を満たす最小 scale を返す。total > 1 年なら null (= natural なし)。
 */
export function findCountdownNaturalScale(totalMs: number): ScaleId | null {
  if (totalMs <= 0) return null;
  for (const id of SCALE_ORDER) {
    if (SCALES[id].periodMs >= totalMs) return id;
  }
  return null;
}

/**
 * countdown mode で lock すべき scale 集合 (= natural より大きい scale)。
 * natural が null (countdown > 1y) なら空集合 (lock なし、全 scale per-cycle)。
 */
export function lockedCountdownScales(naturalScale: ScaleId | null): Set<ScaleId> {
  const locked = new Set<ScaleId>();
  if (!naturalScale) return locked;
  let past = false;
  for (const id of SCALE_ORDER) {
    if (id === naturalScale) {
      past = true;
      continue;
    }
    if (past) locked.add(id);
  }
  return locked;
}

export interface Scale {
  id: ScaleId;
  /** 描画マス数の既定値。resolve() があるスケールでは ignore される */
  count: number;
  /** 1 マス分の実時間 (ms)。resolve() があるスケールでは参考値 */
  msPerCell: number;
  /** 周期全体の長さ (ms) = count × msPerCell。同上 */
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
  unit: 'h' | 'm' | 's' | 'd' | 'M';
  /**
   * 暦アンカー型のスケール (month/year) はここで現フレームの count + filled を返す。
   * `wallClockMs` は壁時計の現在 (Date.now()) を渡す。virtualMs は加速モード等の
   * 仮想経過時間 (主に minute/hour/day で使う)。
   * `ctx` は origin 情報。custom origin のときは anniversary 起点で計算する。
   */
  resolve?(
    virtualMs: number,
    wallClockMs: number,
    ctx?: ResolveContext,
  ): ScaleSnapshot;
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
    fillColor: '#ff7a00', // TRON orange accent
    subdivisions: 60, // 1 時間マス内に 60 分粒子
    unit: 'h',
  },
  month: {
    id: 'month',
    count: 30, // resolve() で 28-31 に上書きされる
    msPerCell: 86_400_000,
    periodMs: 30 * 86_400_000,
    label: '1 month · days of current month',
    shortLabel: 'day',
    fillColor: '#ff3a5e', // red-magenta
    subdivisions: 24, // 1 日マス内に 24 時粒子
    unit: 'd',
    resolve(_virtualMs, wallClockMs, ctx) {
      // custom origin → anniversary 起点で count + filled を計算
      if (ctx?.originMode === 'custom' && ctx.originMs != null) {
        return anniversaryMonthFrame(ctx.originMs, wallClockMs);
      }
      // それ以外 (now / countdown / ctx 省略) → 暦アンカー (現状互換)
      const date = new Date(wallClockMs);
      // new Date(y, m+1, 0) の date 部 = 当月末日 = 当月日数
      const daysInMonth = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
      ).getDate();
      const dayOfMonth = date.getDate(); // 1..N
      const fracDay =
        (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds() +
          date.getMilliseconds() / 1000) /
        86400;
      return {
        count: daysInMonth,
        filled: dayOfMonth - 1 + fracDay,
      };
    },
  },
  year: {
    id: 'year',
    count: 12,
    msPerCell: 30 * 86_400_000,
    periodMs: 365 * 86_400_000,
    label: '1 year · 12 months',
    shortLabel: 'month',
    fillColor: '#c93cff', // violet
    subdivisions: 30, // 1 月マス内に ~30 日粒子
    unit: 'M',
    resolve(_virtualMs, wallClockMs, ctx) {
      // custom origin → anniversary 起点 (yearly anniversary 月単位)
      if (ctx?.originMode === 'custom' && ctx.originMs != null) {
        return anniversaryYearFrame(ctx.originMs, wallClockMs);
      }
      // それ以外 → 暦アンカー (1月1日起点、現状互換)
      const date = new Date(wallClockMs);
      const month = date.getMonth(); // 0..11
      const daysInMonth = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
      ).getDate();
      const dayOfMonth = date.getDate();
      const fracDay =
        (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) /
        86400;
      const fracMonth = (dayOfMonth - 1 + fracDay) / daysInMonth;
      return {
        count: 12,
        filled: month + fracMonth,
      };
    },
  },
};

export const SCALE_ORDER: ScaleId[] = ['minute', 'hour', 'day', 'month', 'year'];

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

/**
 * virtualMs / wallClockMs から現フレームの (count, filled) を返す統一エントリ。
 * resolve() を持つスケールはそれを呼び、ない場合は静的 count + 単純 modulo で算出。
 * `ctx` は origin 情報。resolve() に forward され、custom origin 時に anniversary
 * 起点計算を有効化する。ctx 省略時は calendar 計算 (回帰互換)。
 *
 * countdown mode の挙動:
 *  - ctx.countdownNaturalScale === scale.id のとき: 「natural scale」扱い。
 *    count = floor(total / msPerCell)、filled = floor(remaining / msPerCell) で
 *    countdown 全期間を 1 サイクル化。filled 反転は不要 (filled が既に「残量」)。
 *  - 上記以外: 通常の resolve / filledFor 結果に対し filled を反転 (count - filled)。
 *    砂時計の per-cycle drain として表示 (per-cycle 残量)。
 */
export function snapshotScale(
  scale: Scale,
  virtualMs: number,
  wallClockMs: number,
  ctx?: ResolveContext,
): ScaleSnapshot {
  // countdown natural scale は countdown 全期間を直接マップ (per-cycle 経由しない)
  if (
    ctx?.originMode === 'countdown' &&
    ctx.countdownNaturalScale === scale.id &&
    ctx.countdownTotalMs != null &&
    ctx.countdownRemainingMs != null &&
    scale.msPerCell > 0
  ) {
    const count = Math.max(1, Math.floor(ctx.countdownTotalMs / scale.msPerCell));
    const filled = Math.max(0, Math.min(count, ctx.countdownRemainingMs / scale.msPerCell));
    return { count, filled };
  }
  const base = scale.resolve
    ? scale.resolve(virtualMs, wallClockMs, ctx)
    : { count: scale.count, filled: filledFor(scale, virtualMs) };
  if (ctx?.originMode === 'countdown') {
    return {
      count: base.count,
      filled: Math.max(0, base.count - base.filled),
    };
  }
  return base;
}

/** virtualMs から、当該スケールの現在の塗り目盛 (0 〜 count) を計算 (静的版) */
export function filledFor(scale: Scale, virtualMs: number): number {
  // periodMs を超えた分は modulo (1 周期で 1 周ループ)
  const cycle = ((virtualMs % scale.periodMs) + scale.periodMs) % scale.periodMs;
  return cycle / scale.msPerCell;
}
