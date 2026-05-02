import * as THREE from 'three';

// 砂時計シェル状レイアウト。バルブの内部を 'upper' / 'lower' の半分ずつで生成する。
//
// 順序の規約:
//   - upper: positions[0] が腰寄り、positions[N-1] がリム(上端)寄り
//   - lower: positions[0] がリム(底)寄り、positions[N-1] が腰寄り
//
// これにより Stack が positions[0..count-1] を順に使う前提で、
//   - upper Stack: count を減らすと上端から空く(表面が下がる) = 落下する砂
//   - lower Stack: count を増やすと底から積み上がる = 積もる砂
// が自然に表現される。
//
// ringSizes はリング(層)ごとの粒数。upper では k=0 が腰寄りリング、k=N-1 が外端リング。
// lower では物理的に「広い床」「狭い腰」が自然なので、内部で reverse() して
// 床=ringSizes[last]、腰=ringSizes[0] になるよう揃える。
export function hourglassShellLayout(
  half: 'upper' | 'lower',
  height: number,
  rWaist: number,
  rRim: number,
  ringSizes: number[]
): THREE.Vector3[] {
  const sign = half === 'upper' ? 1 : -1;
  const layers = ringSizes.length;
  const orderedSizes = half === 'upper' ? ringSizes : [...ringSizes].reverse();
  const positions: THREE.Vector3[] = [];

  for (let k = 0; k < layers; k++) {
    // distFromWaist: 0 = 腰寄り、1 = 外端寄り
    const distFromWaist =
      half === 'upper' ? (k + 0.5) / layers : (layers - k - 0.5) / layers;
    const y = sign * height * distFromWaist;
    const r = rWaist + (rRim - rWaist) * distFromWaist;
    const n = orderedSizes[k];
    for (let i = 0; i < n; i++) {
      const theta = (i / n) * Math.PI * 2;
      positions.push(new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta)));
    }
  }
  return positions;
}
