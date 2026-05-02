import * as THREE from 'three';
import { Stack } from './stack';
import { hourglassShellLayout } from './layouts';

export interface HourglassOptions {
  origin: THREE.Vector3;
  height: number;
  rimRadius: number;
  scene: THREE.Scene;
}

const FLIP_DURATION = 1200;
const BASE_LIGHT_INTENSITY = 0.5;

const SEC_RING_SIZES = [12, 12, 12, 12, 12];
const MIN_RING_SIZES = [8, 10, 12, 14, 16];
const HOUR_RING_SIZES = [3, 5, 7, 9];

const SEC_R_WAIST = 0.04;
const SEC_R_RIM = 0.20;
const MIN_R_WAIST = 0.06;
const MIN_R_RIM = 0.55;
const HOUR_R_WAIST = 0.07;
const HOUR_R_RIM = 0.95;

const SEC_COLOR = 0xfff5d0;
const MIN_COLOR = 0xb48b5a;
const HOUR_COLOR = 0xf2c879;

interface RippleEffect {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  geom: THREE.RingGeometry;
  startTime: number;
  duration: number;
  targetScale: number;
}

interface FlashEffect {
  startTime: number;
  duration: number;
  spike: number;
}

interface EmissivePulse {
  mat: THREE.MeshStandardMaterial;
  startTime: number;
  duration: number;
  peak: number;
}

interface ShellPulse {
  shell: THREE.Group;
  startTime: number;
  duration: number;
  amplitude: number;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export class Hourglass {
  readonly group: THREE.Group;
  readonly upperHour: Stack;
  readonly lowerHour: Stack;
  readonly upperMin: Stack;
  readonly lowerMin: Stack;
  readonly upperSec: Stack;
  readonly lowerSec: Stack;

  private opts: HourglassOptions;
  private flipsDone = 0;
  private flipping = false;
  private flipStart = 0;

  private ripples: RippleEffect[] = [];
  private flashes: FlashEffect[] = [];
  private emissivePulses: EmissivePulse[] = [];
  private shellPulses: ShellPulse[] = [];

  private secShellGroup: THREE.Group;
  private minShellGroup: THREE.Group;
  private hourShellGroup: THREE.Group;
  private secMat: THREE.MeshStandardMaterial;
  private minMat: THREE.MeshStandardMaterial;
  private hourMat: THREE.MeshStandardMaterial;
  private waistLight: THREE.PointLight;
  private streamMat: THREE.ShaderMaterial;

  constructor(opts: HourglassOptions) {
    this.opts = opts;
    this.group = new THREE.Group();
    this.group.position.copy(opts.origin);

    const H = opts.height;
    const Rmax = opts.rimRadius;

    // ---------- 殻 (LatheGeometry) ----------
    const profile: THREE.Vector2[] = [
      new THREE.Vector2(Rmax * 0.85, -H),
      new THREE.Vector2(Rmax * 1.0, -H * 0.97),
      new THREE.Vector2(Rmax * 0.98, -H * 0.80),
      new THREE.Vector2(Rmax * 0.55, -H * 0.40),
      new THREE.Vector2(Rmax * 0.20, -H * 0.15),
      new THREE.Vector2(Rmax * 0.06, 0),
      new THREE.Vector2(Rmax * 0.20, H * 0.15),
      new THREE.Vector2(Rmax * 0.55, H * 0.40),
      new THREE.Vector2(Rmax * 0.98, H * 0.80),
      new THREE.Vector2(Rmax * 1.0, H * 0.97),
      new THREE.Vector2(Rmax * 0.85, H),
    ];
    const envelopeGeom = new THREE.LatheGeometry(profile, 96);
    const envelopeMat = new THREE.MeshPhysicalMaterial({
      color: 0xc8dcf0,
      side: THREE.DoubleSide,
      roughness: 0.05,
      metalness: 0.0,
      transmission: 0.92,
      thickness: 0.4,
      ior: 1.45,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      attenuationColor: 0xa0c0e0,
      attenuationDistance: 2.5,
      depthWrite: false,
    });
    const envelope = new THREE.Mesh(envelopeGeom, envelopeMat);
    this.group.add(envelope);

    // ---------- フレーム Torus (上端 / 腰 / 下端) ----------
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x9aaccc,
      roughness: 0.22,
      metalness: 0.75,
    });
    const addFrame = (radius: number, y: number) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 8, 48), frameMat);
      t.rotation.x = Math.PI / 2;
      t.position.y = y;
      this.group.add(t);
    };
    addFrame(Rmax * 0.85, H);
    addFrame(Rmax * 0.85, -H);
    addFrame(Rmax * 0.06, 0);

    // ---------- 腰のポイントライト ----------
    this.waistLight = new THREE.PointLight(0xffd58a, BASE_LIGHT_INTENSITY, 1.5);
    this.waistLight.position.set(0, 0, 0);
    this.group.add(this.waistLight);

    // ---------- 3 シェル × 上下 = 6 Stack ----------
    // 粒の baseline emissive は最小限。常時 bloom させずに、イベント時の
    // pulse だけが光る = 「事件が起きた瞬間だけ世界が反応する」演出。
    this.secMat = new THREE.MeshStandardMaterial({
      color: SEC_COLOR,
      emissive: SEC_COLOR,
      emissiveIntensity: 0.02,
      roughness: 0.32,
      metalness: 0.0,
    });
    this.minMat = new THREE.MeshStandardMaterial({
      color: MIN_COLOR,
      emissive: MIN_COLOR,
      emissiveIntensity: 0.015,
      roughness: 0.42,
      metalness: 0.1,
    });
    this.hourMat = new THREE.MeshStandardMaterial({
      color: HOUR_COLOR,
      emissive: HOUR_COLOR,
      emissiveIntensity: 0.015,
      roughness: 0.42,
      metalness: 0.1,
    });

    const secGeom = new THREE.SphereGeometry(0.022, 8, 8);
    const minGeom = new THREE.SphereGeometry(0.038, 10, 10);
    const hourGeom = new THREE.SphereGeometry(0.060, 12, 12);

    // 粒の登場/退場の動線:
    //   upper: 上 (y=+H 付近) から target へ落下 → 退場時は腰中央 (0,0,0) へ吸い込まれる
    //   lower: 腰中央 (0,0,0) から target へ広がるように落下 → 退場時も腰中央へ
    //   いずれも「水が砂時計の腰を通る」イメージで、流れの中心が腰になる。
    const makeStack = (
      half: 'upper' | 'lower',
      rWaist: number,
      rRim: number,
      ringSizes: number[],
      geom: THREE.BufferGeometry,
      mat: THREE.Material,
    ): Stack => {
      const enterFrom =
        half === 'upper'
          ? (t: THREE.Vector3) => new THREE.Vector3(t.x, H * 1.05, t.z)
          : (_t: THREE.Vector3) => new THREE.Vector3(0, 0, 0);
      const exitTo = (_t: THREE.Vector3) => new THREE.Vector3(0, 0, 0);
      return new Stack({
        positions: hourglassShellLayout(half, H, rWaist, rRim, ringSizes),
        createBox: () => new THREE.Mesh(geom, mat),
        origin: new THREE.Vector3(0, 0, 0),
        enterFrom,
        exitTo,
      });
    };

    this.upperSec = makeStack('upper', SEC_R_WAIST, SEC_R_RIM, SEC_RING_SIZES, secGeom, this.secMat);
    this.lowerSec = makeStack('lower', SEC_R_WAIST, SEC_R_RIM, SEC_RING_SIZES, secGeom, this.secMat);
    this.upperMin = makeStack('upper', MIN_R_WAIST, MIN_R_RIM, MIN_RING_SIZES, minGeom, this.minMat);
    this.lowerMin = makeStack('lower', MIN_R_WAIST, MIN_R_RIM, MIN_RING_SIZES, minGeom, this.minMat);
    this.upperHour = makeStack('upper', HOUR_R_WAIST, HOUR_R_RIM, HOUR_RING_SIZES, hourGeom, this.hourMat);
    this.lowerHour = makeStack('lower', HOUR_R_WAIST, HOUR_R_RIM, HOUR_RING_SIZES, hourGeom, this.hourMat);

    this.secShellGroup = new THREE.Group();
    this.secShellGroup.add(this.upperSec.group, this.lowerSec.group);
    this.minShellGroup = new THREE.Group();
    this.minShellGroup.add(this.upperMin.group, this.lowerMin.group);
    this.hourShellGroup = new THREE.Group();
    this.hourShellGroup.add(this.upperHour.group, this.lowerHour.group);
    this.group.add(this.secShellGroup, this.minShellGroup, this.hourShellGroup);

    // ---------- 中央落下光柱 (時の流れ) ----------
    // 砂時計の中央軸に細い垂直の光。下方向にスクロールする縞模様を shader で生成し、
    // 「時間が落ちている」感を常時可視化する。
    const streamGeom = new THREE.PlaneGeometry(0.18, 2 * H * 1.05);
    this.streamMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0xfff5d0) },
        uIntensity: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          // 縦の縞 (4 本) が下方向に流れる
          float v = vUv.y * 4.0 - uTime * 0.9;
          float band = smoothstep(0.0, 0.45, fract(v)) * (1.0 - smoothstep(0.5, 0.95, fract(v)));
          // 中心線にだけ光、両端は透明 (radial fade)
          float r = abs(vUv.x - 0.5) * 2.0;
          float radial = pow(1.0 - r, 2.0);
          // 縦方向: 腰 (vUv.y=0.5) を中心に明るく
          float vertical = 1.0 - abs(vUv.y - 0.5) * 0.7;
          float bright = (0.18 + band * 0.55) * radial * vertical;
          gl_FragColor = vec4(uColor * bright * uIntensity, bright * uIntensity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const streamMesh = new THREE.Mesh(streamGeom, this.streamMat);
    streamMesh.renderOrder = 5;
    this.group.add(streamMesh);
    // 反対側からも見えるよう 90 度回した plane を重ねる (常に正面を向く双葉)
    const streamMesh2 = streamMesh.clone();
    streamMesh2.rotation.y = Math.PI / 2;
    this.group.add(streamMesh2);
  }

  get flipped(): boolean {
    return this.flipsDone % 2 === 1;
  }

  get isFlipping(): boolean {
    return this.flipping;
  }

  triggerMinute(now: number): void {
    this.spawnRipple(now, 0.6, SEC_COLOR, 500);
    this.flashes.push({ startTime: now, duration: 500, spike: 0.6 });
    this.emissivePulses.push({ mat: this.secMat, startTime: now, duration: 350, peak: 0.6 });
  }

  triggerHour(now: number): void {
    this.spawnRipple(now, 1.4, MIN_COLOR, 800);
    this.flashes.push({ startTime: now, duration: 800, spike: 1.5 });
    this.emissivePulses.push({ mat: this.minMat, startTime: now, duration: 500, peak: 0.7 });
    this.shellPulses.push({ shell: this.minShellGroup, startTime: now, duration: 500, amplitude: 0.12 });
  }

  startFlip(now: number): void {
    this.flipping = true;
    this.flipStart = now;
    this.spawnRipple(now, 2.5, HOUR_COLOR, 1500);
    this.flashes.push({ startTime: now, duration: FLIP_DURATION, spike: 2.0 });
    this.emissivePulses.push({ mat: this.secMat, startTime: now, duration: FLIP_DURATION, peak: 0.5 });
    this.emissivePulses.push({ mat: this.minMat, startTime: now, duration: FLIP_DURATION, peak: 0.5 });
    this.emissivePulses.push({ mat: this.hourMat, startTime: now, duration: FLIP_DURATION, peak: 0.5 });
    this.shellPulses.push({ shell: this.secShellGroup, startTime: now, duration: FLIP_DURATION, amplitude: 0.10 });
    this.shellPulses.push({ shell: this.minShellGroup, startTime: now, duration: FLIP_DURATION, amplitude: 0.10 });
    this.shellPulses.push({ shell: this.hourShellGroup, startTime: now, duration: FLIP_DURATION, amplitude: 0.10 });
  }

  update(now: number): void {
    // 中央光柱: time uniform を進めて縞を流す
    this.streamMat.uniforms.uTime.value = now * 0.001;

    if (this.flipping) {
      const t = Math.min((now - this.flipStart) / FLIP_DURATION, 1);
      this.group.rotation.z = (this.flipsDone + easeInOutCubic(t)) * Math.PI;
      if (t >= 1) {
        this.flipping = false;
        this.flipsDone += 1;
        this.group.rotation.z = this.flipsDone * Math.PI;
      }
    }

    this.ripples = this.ripples.filter((r) => {
      const t = (now - r.startTime) / r.duration;
      if (t >= 1) {
        this.opts.scene.remove(r.mesh);
        r.geom.dispose();
        r.mat.dispose();
        return false;
      }
      const eased = easeOutCubic(t);
      r.mesh.scale.setScalar(0.001 + eased * r.targetScale);
      r.mat.opacity = 1 - t;
      return true;
    });

    let flashSum = 0;
    this.flashes = this.flashes.filter((f) => {
      const t = (now - f.startTime) / f.duration;
      if (t >= 1) return false;
      flashSum += f.spike * (1 - t);
      return true;
    });
    this.waistLight.intensity = BASE_LIGHT_INTENSITY + flashSum;

    const peakByMat = new Map<THREE.MeshStandardMaterial, number>();
    this.emissivePulses = this.emissivePulses.filter((p) => {
      const t = (now - p.startTime) / p.duration;
      if (t >= 1) return false;
      const v = p.peak * Math.sin(t * Math.PI);
      peakByMat.set(p.mat, Math.max(peakByMat.get(p.mat) ?? 0, v));
      return true;
    });
    const baseEmissive: ReadonlyMap<THREE.MeshStandardMaterial, number> = new Map([
      [this.secMat, 0.02],
      [this.minMat, 0.015],
      [this.hourMat, 0.015],
    ]);
    for (const mat of [this.secMat, this.minMat, this.hourMat]) {
      mat.emissiveIntensity = (baseEmissive.get(mat) ?? 0) + (peakByMat.get(mat) ?? 0);
    }

    const ampByShell = new Map<THREE.Group, number>();
    this.shellPulses = this.shellPulses.filter((p) => {
      const t = (now - p.startTime) / p.duration;
      if (t >= 1) return false;
      const v = p.amplitude * Math.sin(t * Math.PI);
      ampByShell.set(p.shell, Math.max(ampByShell.get(p.shell) ?? 0, v));
      return true;
    });
    for (const shell of [this.secShellGroup, this.minShellGroup, this.hourShellGroup]) {
      shell.scale.setScalar(1 + (ampByShell.get(shell) ?? 0));
    }

    this.upperSec.update(now);
    this.lowerSec.update(now);
    this.upperMin.update(now);
    this.lowerMin.update(now);
    this.upperHour.update(now);
    this.lowerHour.update(now);
  }

  private spawnRipple(now: number, targetScale: number, color: number, duration: number): void {
    const geom = new THREE.RingGeometry(0.95, 1.0, 64);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(this.opts.origin);
    mesh.scale.setScalar(0.001);
    this.opts.scene.add(mesh);
    this.ripples.push({ mesh, mat, geom, startTime: now, duration, targetScale });
  }
}
