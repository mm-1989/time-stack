import * as THREE from 'three';

export interface StackOptions {
  positions: THREE.Vector3[];
  createBox: () => THREE.Object3D;
  origin: THREE.Vector3;
  /** 粒が現れる元位置 (target を受け取り、from 位置を返す) */
  enterFrom: (target: THREE.Vector3) => THREE.Vector3;
  /** 粒が消える先位置 (target を受け取り、to 位置を返す) */
  exitTo: (target: THREE.Vector3) => THREE.Vector3;
}

type BoxState = 'in' | 'live' | 'out';

interface SpawnedBox {
  obj: THREE.Object3D;
  state: BoxState;
  phaseStart: number;
  fromPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  exitPos: THREE.Vector3;
}

const POP_IN_MS = 700;
const POP_OUT_MS = 550;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function easeInQuad(t: number): number {
  return t * t;
}
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export class Stack {
  readonly group: THREE.Group;
  private opts: StackOptions;
  private boxes: SpawnedBox[] = [];

  constructor(opts: StackOptions) {
    this.opts = opts;
    this.group = new THREE.Group();
    this.group.position.copy(opts.origin);
  }

  /** in + live の合計 (out 中は除外。「実体として存在する粒数」) */
  get liveCount(): number {
    let n = 0;
    for (const b of this.boxes) if (b.state !== 'out') n++;
    return n;
  }

  get capacity(): number {
    return this.opts.positions.length;
  }

  add(now: number): void {
    if (this.liveCount >= this.capacity) return;
    const idx = this.liveCount;
    const target = this.opts.positions[idx].clone();
    const from = this.opts.enterFrom(target);
    const exit = this.opts.exitTo(target);
    const obj = this.opts.createBox();
    obj.position.copy(from);
    obj.scale.setScalar(0.001);
    this.group.add(obj);
    this.boxes.push({
      obj,
      state: 'in',
      phaseStart: now,
      fromPos: from,
      targetPos: target,
      exitPos: exit,
    });
  }

  /** 最後尾の live (or in) 粒を out 状態に切り替える (落下退場アニメへ) */
  removeOne(now: number): void {
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i];
      if (b.state === 'out') continue;
      b.state = 'out';
      b.phaseStart = now;
      b.fromPos = b.obj.position.clone();
      return;
    }
  }

  clear(): void {
    for (const b of this.boxes) this.group.remove(b.obj);
    this.boxes = [];
  }

  update(now: number): void {
    const remaining: SpawnedBox[] = [];
    for (const b of this.boxes) {
      const elapsed = now - b.phaseStart;
      if (b.state === 'in') {
        if (elapsed >= POP_IN_MS) {
          b.obj.position.copy(b.targetPos);
          b.obj.scale.setScalar(1);
          b.state = 'live';
        } else {
          const t = elapsed / POP_IN_MS;
          // 位置: easeOutCubic = 重力で落ちて緩やかに着地
          b.obj.position.lerpVectors(b.fromPos, b.targetPos, easeOutCubic(t));
          // スケール: easeOutBack で着地時に微小オーバーシュート (タッチダウン感)
          b.obj.scale.setScalar(Math.max(0.001, easeOutBack(t)));
        }
        remaining.push(b);
      } else if (b.state === 'live') {
        remaining.push(b);
      } else {
        // 'out': 位置は easeInQuad で加速落下、scale は 1→0
        if (elapsed >= POP_OUT_MS) {
          this.group.remove(b.obj);
          continue;
        }
        const t = elapsed / POP_OUT_MS;
        b.obj.position.lerpVectors(b.fromPos, b.exitPos, easeInQuad(t));
        b.obj.scale.setScalar(Math.max(0.001, 1 - easeOutQuad(t)));
        remaining.push(b);
      }
    }
    this.boxes = remaining;
  }
}

export function syncStack(stack: Stack, target: number, now: number): void {
  // 一気に clear ではなく、1 個ずつ remove/add する。
  // 「物体が移動して見える」ためにはこの差分駆動が必須。
  while (stack.liveCount > target) stack.removeOne(now);
  while (stack.liveCount < target) stack.add(now);
}
