import * as THREE from 'three';

export interface StackOptions {
  capacity: number;
  cols: number;
  cellSize: number;
  spacing: number;
  color: number;
  position: THREE.Vector3;
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
    this.group.position.copy(opts.position);
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

  add(now: number): void {
    if (this.boxes.length >= this.opts.capacity) return;

    const index = this.boxes.length;
    const mesh = new THREE.Mesh(this.geometry, this.material);
    const { x, y, z } = this.cellPosition(index);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(0.001);
    this.group.add(mesh);
    this.boxes.push({ mesh, spawnedAt: now });
  }

  clear(): void {
    for (const { mesh } of this.boxes) {
      this.group.remove(mesh);
    }
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

  private cellPosition(index: number): { x: number; y: number; z: number } {
    const { cols, spacing } = this.opts;
    const rowsPerCol = Math.ceil(this.opts.capacity / cols);
    const col = Math.floor(index / rowsPerCol);
    const row = index % rowsPerCol;
    const x = (col - (cols - 1) / 2) * spacing;
    const y = row * spacing + spacing / 2;
    return { x, y, z: 0 };
  }
}
