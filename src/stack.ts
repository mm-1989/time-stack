import * as THREE from 'three';

export interface StackOptions {
  positions: THREE.Vector3[];
  createBox: () => THREE.Object3D;
  origin: THREE.Vector3;
}

interface SpawnedBox {
  obj: THREE.Object3D;
  spawnedAt: number;
}

const POP_DURATION_MS = 320;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
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

  get count(): number {
    return this.boxes.length;
  }

  get capacity(): number {
    return this.opts.positions.length;
  }

  add(now: number): void {
    if (this.boxes.length >= this.capacity) return;
    const idx = this.boxes.length;
    const obj = this.opts.createBox();
    obj.position.copy(this.opts.positions[idx]);
    obj.scale.setScalar(0.001);
    this.group.add(obj);
    this.boxes.push({ obj, spawnedAt: now });
  }

  clear(): void {
    for (const { obj } of this.boxes) this.group.remove(obj);
    this.boxes = [];
  }

  update(now: number): void {
    for (const { obj, spawnedAt } of this.boxes) {
      const elapsed = now - spawnedAt;
      if (elapsed >= POP_DURATION_MS) {
        if (obj.scale.x !== 1) obj.scale.setScalar(1);
        continue;
      }
      const t = elapsed / POP_DURATION_MS;
      obj.scale.setScalar(easeOutBack(t));
    }
  }
}

export function syncStack(stack: Stack, target: number, now: number): void {
  if (stack.count > target) stack.clear();
  while (stack.count < target) stack.add(now);
}
