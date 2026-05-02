import * as THREE from 'three';

// 切頂二十面体(C60 / Buckminsterfullerene)の頂点 60 個。
export function c60Layout(targetRadius: number): THREE.Vector3[] {
  const phi = (1 + Math.sqrt(5)) / 2;
  const baseGroups: Array<[number, number, number]> = [
    [0, 1, 3 * phi],
    [1, 2 + phi, 2 * phi],
    [phi, 2, 1 + 2 * phi],
  ];

  const seen = new Map<string, THREE.Vector3>();
  for (const base of baseGroups) {
    for (let perm = 0; perm < 3; perm++) {
      const sgn = (n: number) => (n === 0 ? [1] : [-1, 1]);
      for (const sa of sgn(base[0])) {
        for (const sb of sgn(base[1])) {
          for (const sc of sgn(base[2])) {
            const raw = [base[0] * sa, base[1] * sb, base[2] * sc];
            const xyz: [number, number, number] = [
              raw[perm % 3],
              raw[(perm + 1) % 3],
              raw[(perm + 2) % 3],
            ];
            const key = xyz.map((n) => n.toFixed(4)).join(',');
            if (!seen.has(key)) {
              seen.set(key, new THREE.Vector3(xyz[0], xyz[1], xyz[2]));
            }
          }
        }
      }
    }
  }

  const vertices = Array.from(seen.values());
  const naturalRadius = vertices[0].length();
  vertices.forEach((v) => v.multiplyScalar(targetRadius / naturalRadius));
  vertices.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 0.001) return a.y - b.y;
    return Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x);
  });
  vertices.forEach((v) => (v.y += targetRadius));
  return vertices;
}

// 黄金角分布で球面に N 点を均等配置。N=60 以外のスケール(時=24)で使う。
export function fibonacciSphereLayout(count: number, radius: number): THREE.Vector3[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    points.push(new THREE.Vector3(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius));
  }
  points.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 0.001) return a.y - b.y;
    return Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x);
  });
  points.forEach((v) => (v.y += radius));
  return points;
}

// 同心六角環(中心なし)。capacity を指定すると先頭 N 個でスライス。60=4 環フル / 24=ring1+2+ring3 前半。
export function hexRingsLayout(spacing: number, capacity = 60): THREE.Vector3[] {
  const vertices: THREE.Vector3[] = [];
  const RINGS = 4;
  for (let n = 1; n <= RINGS; n++) {
    for (let side = 0; side < 6; side++) {
      const a0 = (side * Math.PI) / 3;
      const a1 = ((side + 1) * Math.PI) / 3;
      const sx = Math.cos(a0) * n * spacing;
      const sy = Math.sin(a0) * n * spacing;
      const ex = Math.cos(a1) * n * spacing;
      const ey = Math.sin(a1) * n * spacing;
      for (let k = 0; k < n; k++) {
        const t = k / n;
        vertices.push(new THREE.Vector3(sx + (ex - sx) * t, sy + (ey - sy) * t, 0));
      }
    }
  }
  const outerRadius = RINGS * spacing;
  vertices.forEach((v) => (v.y += outerRadius));
  return vertices.slice(0, capacity);
}

// 縦方向タワー。day スタック用(1 日 = 1 ボックス、下から積む)。
export function linearStackLayout(count: number, spacing: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    points.push(new THREE.Vector3(0, i * spacing + spacing / 2, 0));
  }
  return points;
}
