import * as THREE from 'three';

// 球面座標 (radius, theta=方位角, phi=仰角π/2-極角) ベースのカメラ演出。
// - 起動時: radius を遠→定位置へドリーイン (cinematic intro)
// - 常時: 微小な sin ドリフト (theta/phi)
// - flip イベント: radius を一時的に縮め→伸ばす push-in/pull-back
// - マウスドラッグ: theta/phi をユーザー操作。離すとゆっくり中心へ戻る

export interface CameraRigOptions {
  baseRadius: number;
  introRadius: number;
  introDurationMs: number;
  target: THREE.Vector3;
  /** ドリフト振幅倍率。0 で常時揺らぎ無効 (prefers-reduced-motion 用) */
  driftScale?: number;
}

interface FlipPulse {
  startTime: number;
  duration: number;
}

export class CameraRig {
  private opts: CameraRigOptions;
  readonly target: THREE.Vector3;
  private camera: THREE.PerspectiveCamera;
  private startedAt = 0;

  // ユーザードラッグ蓄積 (target に対するオフセット)
  private userTheta = 0;
  private userPhi = 0;
  // ドラッグ復帰: pointerup 後に 0 に向かって減衰
  private dragging = false;

  private flipPulses: FlipPulse[] = [];

  constructor(camera: THREE.PerspectiveCamera, opts: CameraRigOptions) {
    this.camera = camera;
    this.opts = opts;
    this.target = opts.target.clone();
  }

  start(now: number): void {
    this.startedAt = now;
  }

  triggerFlip(now: number, duration = 1200): void {
    this.flipPulses.push({ startTime: now, duration });
  }

  beginDrag(): void {
    this.dragging = true;
  }

  endDrag(): void {
    this.dragging = false;
  }

  drag(dx: number, dy: number): void {
    if (!this.dragging) return;
    const k = 0.005;
    this.userTheta += dx * k;
    this.userPhi -= dy * k;
    // phi 制限 (上下反転防止)
    const limit = Math.PI / 2 - 0.15;
    this.userPhi = Math.max(-limit, Math.min(limit, this.userPhi));
  }

  update(now: number, deltaSec: number): void {
    const t = Math.max(0, now - this.startedAt);

    // ドリーイン (起動時 introRadius → baseRadius)
    let introT: number;
    if (t < this.opts.introDurationMs) {
      const u = t / this.opts.introDurationMs;
      introT = 1 - Math.pow(1 - u, 4); // easeOutQuart
    } else {
      introT = 1;
    }
    const baseR = this.opts.introRadius + (this.opts.baseRadius - this.opts.introRadius) * introT;

    // 常時ドリフト (sin)。reduced-motion 時は driftScale=0 で停止。
    const ds = this.opts.driftScale ?? 1;
    const driftTheta = Math.sin(t * 0.00018) * 0.18 * ds;
    const driftPhi = Math.sin(t * 0.00026 + 1.0) * 0.06 * ds;

    // flip pulse: radius を一時的に縮める
    let flipDR = 0;
    this.flipPulses = this.flipPulses.filter((p) => {
      const u = (now - p.startTime) / p.duration;
      if (u >= 1) return false;
      // 0→0.3で push-in (-0.7), 0.3→1 で pull-out (+0.4) して戻る
      const w = u < 0.3 ? -0.7 * (u / 0.3) : -0.7 + 1.1 * ((u - 0.3) / 0.7);
      flipDR += w * Math.sin(u * Math.PI);
      return true;
    });

    // ユーザードラッグ復帰 (離した後にゆっくり 0 へ)
    if (!this.dragging) {
      const k = Math.min(1, deltaSec * 0.6);
      this.userTheta *= 1 - k;
      this.userPhi *= 1 - k;
    }

    const finalTheta = driftTheta + this.userTheta;
    const finalPhi = Math.PI / 2 + driftPhi + this.userPhi;
    const finalRadius = baseR + flipDR;

    // 球面座標 → 直交
    const sinPhi = Math.sin(finalPhi);
    const cosPhi = Math.cos(finalPhi);
    const x = finalRadius * sinPhi * Math.sin(finalTheta);
    const y = finalRadius * cosPhi;
    const z = finalRadius * sinPhi * Math.cos(finalTheta);

    this.camera.position.set(this.target.x + x, this.target.y + y, this.target.z + z);
    this.camera.lookAt(this.target);

    // intro 中はわずかに up を傾ける (映画的)
    if (introT < 1) {
      const tilt = (1 - introT) * 0.04;
      this.camera.up.set(Math.sin(tilt), Math.cos(tilt), 0);
    } else if (this.camera.up.x !== 0) {
      this.camera.up.set(0, 1, 0);
    }
  }

  attachPointer(target: HTMLElement): () => void {
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      target.setPointerCapture(e.pointerId);
      this.beginDrag();
    };
    const onMove = (e: PointerEvent) => {
      if (!this.dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.drag(dx, dy);
    };
    const onUp = (e: PointerEvent) => {
      target.releasePointerCapture(e.pointerId);
      this.endDrag();
    };
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
    return () => {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    };
  }
}
