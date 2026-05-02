import * as THREE from 'three';

export interface StackOptions {
  positions: THREE.Vector3[];
  cellSize: number;
  color: number;
  origin: THREE.Vector3;
}

interface SpawnedBox {
  mesh: THREE.Mesh;
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
  private geometry: THREE.BoxGeometry;
  private material: THREE.MeshStandardMaterial;

  constructor(opts: StackOptions) {
    this.opts = opts;
    this.group = new THREE.Group();
    this.group.position.copy(opts.origin);
    this.geometry = new THREE.BoxGeometry(opts.cellSize, opts.cellSize, opts.cellSize);
    this.material = new THREE.MeshStandardMaterial({
      color: opts.color,
      roughness: 0.5,
      metalness: 0.1,
    });
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
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.position.copy(this.opts.positions[idx]);
    mesh.scale.setScalar(0.001);
    this.group.add(mesh);
    this.boxes.push({ mesh, spawnedAt: now });
  }

  clear(): void {
    for (const { mesh } of this.boxes) this.group.remove(mesh);
    this.boxes = [];
  }

  update(now: number): void {
    for (const { mesh, spawnedAt } of this.boxes) {
      const elapsed = now - spawnedAt;
      if (elapsed >= POP_DURATION_MS) {
        if (mesh.scale.x !== 1) mesh.scale.setScalar(1);
        continue;
      }
      const t = elapsed / POP_DURATION_MS;
      mesh.scale.setScalar(easeOutBack(t));
    }
  }
}
