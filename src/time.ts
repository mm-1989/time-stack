// 仮想時計: 経過時間を speed 倍で進ませる。freeze で一時停止、skip で前進可。
export class VirtualClock {
  private virtualMs: number;
  private lastWall: number;
  readonly speed: number;
  frozen = false;

  constructor(speed: number, initialWallMs: number, initialVirtualMs = 0) {
    this.speed = speed;
    this.lastWall = initialWallMs;
    this.virtualMs = initialVirtualMs;
  }

  /** wall clock の現在時刻を渡し、進めた virtualMs を返す */
  tick(wallMs: number): number {
    const delta = wallMs - this.lastWall;
    this.lastWall = wallMs;
    if (!this.frozen) this.virtualMs += delta * this.speed;
    return this.virtualMs;
  }

  /** virtualMs に直接加算 (skip キー用) */
  skip(deltaMs: number): void {
    this.virtualMs += deltaMs;
  }

  /** virtualMs を直接書き換え (マスクリック ジャンプ用) */
  setVirtualMs(ms: number): void {
    this.virtualMs = ms;
  }

  toggleFreeze(): void {
    this.frozen = !this.frozen;
  }
}

// JST (UTC+9) 上での「本日 0:00:00」から、指定 UTC ms までの経過 ms。
// VirtualClock の起点を「JST 本日 0:00:00」にしたい時に渡す。
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export function elapsedSinceJstMidnight(nowUtcMs: number): number {
  const jstWallMs = nowUtcMs + JST_OFFSET_MS;
  return ((jstWallMs % 86_400_000) + 86_400_000) % 86_400_000;
}

/** 現在の JST 壁時計を hh:mm:ss でフォーマット */
export function formatJstClock(nowUtcMs: number): string {
  const ms = elapsedSinceJstMidnight(nowUtcMs);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor(totalSec / 60) % 60;
  const s = totalSec % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
