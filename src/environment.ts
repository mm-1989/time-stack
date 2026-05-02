import * as THREE from 'three';

// ---------- 背景グラデ ----------
// 全画面 plane を NDC で固定描画 (depth=1 で常に最背面)。
// 2 色を hour に応じて補間し、昼夜サイクルを表現する。

interface DayPalette {
  top: number;
  bot: number;
}

// 6 つのアンカー時間帯。間は HSL 補間ではなく RGB lerp (色相ジャンプ回避)。
const PALETTE: { hour: number; pal: DayPalette }[] = [
  { hour: 0, pal: { top: 0x0a0f1c, bot: 0x000004 } }, // 深夜
  { hour: 5, pal: { top: 0x1a2845, bot: 0x06080f } }, // 夜明け前
  { hour: 7, pal: { top: 0x3a4870, bot: 0x141828 } }, // 朝
  { hour: 12, pal: { top: 0x4a5870, bot: 0x1a1e28 } }, // 真昼
  { hour: 17, pal: { top: 0x4a3050, bot: 0x180818 } }, // 夕方
  { hour: 19, pal: { top: 0x281024, bot: 0x08040a } }, // 夕暮れ
  { hour: 22, pal: { top: 0x0e1426, bot: 0x020208 } }, // 夜
  { hour: 24, pal: { top: 0x0a0f1c, bot: 0x000004 } }, // = hour 0
];

function lerpColorHex(a: number, b: number, t: number): THREE.Color {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return ca.lerp(cb, t);
}

export function paletteForHour(hourFloat: number): DayPalette {
  // hourFloat in [0, 24)
  const h = ((hourFloat % 24) + 24) % 24;
  for (let i = 0; i < PALETTE.length - 1; i++) {
    const a = PALETTE[i];
    const b = PALETTE[i + 1];
    if (h >= a.hour && h <= b.hour) {
      const t = (h - a.hour) / (b.hour - a.hour);
      return {
        top: lerpColorHex(a.pal.top, b.pal.top, t).getHex(),
        bot: lerpColorHex(a.pal.bot, b.pal.bot, t).getHex(),
      };
    }
  }
  return PALETTE[0].pal;
}

export class Background {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private topCol = new THREE.Color();
  private botCol = new THREE.Color();
  private topTarget = new THREE.Color();
  private botTarget = new THREE.Color();

  constructor() {
    const geom = new THREE.PlaneGeometry(2, 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uColorTop: { value: new THREE.Color(0x0a0f1c) },
        uColorBot: { value: new THREE.Color(0x000004) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 1.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColorTop;
        uniform vec3 uColorBot;
        varying vec2 vUv;
        void main() {
          // ベースは縦方向の線形補間 + わずかなビネット (中央が少し暗い)
          float vy = smoothstep(0.0, 1.0, vUv.y);
          vec3 col = mix(uColorBot, uColorTop, vy);
          // 軽い radial 暗化 (中央 0.85 倍, 周辺 1.0)
          float r = distance(vUv, vec2(0.5));
          col *= mix(0.85, 1.0, smoothstep(0.0, 0.7, r));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geom, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  setTargetHour(hourFloat: number): void {
    const pal = paletteForHour(hourFloat);
    this.topTarget.setHex(pal.top);
    this.botTarget.setHex(pal.bot);
  }

  update(deltaSec: number): void {
    // 1 秒で 8% 移動 = ~12.5 秒で同期 (色変化を滑らか化)
    const k = Math.min(1, deltaSec * 0.08);
    this.topCol.lerp(this.topTarget, k);
    this.botCol.lerp(this.botTarget, k);
    (this.mat.uniforms.uColorTop.value as THREE.Color).copy(this.topCol);
    (this.mat.uniforms.uColorBot.value as THREE.Color).copy(this.botCol);
  }
}

// ---------- 環境ダスト粒子 ----------
// 漂う微細な点。bloom と相まって空気感を出す。

export class Dust {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private velocities: Float32Array;
  private count: number;

  constructor(count = 320) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.positions[i * 3 + 0] = (Math.random() - 0.5) * 14;
      this.positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
      this.velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.04;
      this.velocities[i * 3 + 1] = Math.random() * 0.06 + 0.01;
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffe8c0,
      size: 0.022,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geom, mat);
    this.points.frustumCulled = false;
  }

  update(deltaSec: number): void {
    const d = Math.min(deltaSec, 0.05);
    for (let i = 0; i < this.count; i++) {
      this.positions[i * 3 + 0] += this.velocities[i * 3 + 0] * d;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * d;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * d;
      // 上にスクロール → 上端を超えたら下から再注入
      if (this.positions[i * 3 + 1] > 4) {
        this.positions[i * 3 + 1] = -4;
        this.positions[i * 3 + 0] = (Math.random() - 0.5) * 14;
        this.positions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2;
      }
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
