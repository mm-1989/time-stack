import * as THREE from 'three';

// 切頂二十面体(C60 / Buckminsterfullerene)の頂点 60 個。
// 黄金比 φ を使った 3 群の座標式:(0, ±1, ±3φ), (±1, ±(2+φ), ±2φ), (±φ, ±2, ±(1+2φ))
// 各群を円順列(cyclic permutation)で 3 通りに並べ替えて合計 60 頂点を生成。
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

  // 下から上へ螺旋状に出現させるため (y, theta) でソート
  vertices.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 0.001) return a.y - b.y;
    return Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x);
  });

  // 球の底を y=0 に揃える
  vertices.forEach((v) => (v.y += targetRadius));

  return vertices;
}

// 同心六角環 4 重(中心なし): 6 + 12 + 18 + 24 = 60 個
// 内側のリングから外側へ、各リングは 6 角形の周をなぞる
export function hexRingsLayout(spacing: number): THREE.Vector3[] {
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

  // 全体を上にずらして床 y=0 に乗せる
  const outerRadius = RINGS * spacing;
  vertices.forEach((v) => (v.y += outerRadius));

  return vertices;
}
