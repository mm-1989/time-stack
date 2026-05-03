// 仮想時計: 経過時間を speed 倍で進ませる。freeze で一時停止、skip で前進可。
export class VirtualClock {
  private virtualMs = 0;
  private lastWall: number;
  readonly speed: number;
  frozen = false;

  constructor(speed: number, initialWallMs: number) {
    this.speed = speed;
    this.lastWall = initialWallMs;
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

  toggleFreeze(): void {
    this.frozen = !this.frozen;
  }
}
