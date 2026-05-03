// 軽量 WebAudio エフェクト。WebAudio はユーザインタラクション後にしか音を出せないため、
// AudioContext は遅延生成。デフォルトはミュート (UX を邪魔しない)。

let ctx: AudioContext | null = null;
let muted = true;

export function setMuted(m: boolean): void {
  muted = m;
  // unmute 時に context を ensure (ユーザインタラクション後の前提)
  if (!muted) ensureCtx()?.resume?.();
}
export function isMuted(): boolean {
  return muted;
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const Ctor = (window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    });
    const C = Ctor.AudioContext ?? Ctor.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    return ctx;
  } catch {
    return null;
  }
}

/** マス完了の細かいティック音 (sine 880Hz, 60ms) */
export function playTick(): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  osc.connect(gain);
  gain.connect(c.destination);
  const now = c.currentTime;
  gain.gain.setValueAtTime(0.035, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  osc.start(now);
  osc.stop(now + 0.07);
}

/** 1 周期完了 (collapse) 時の和音チャイム */
export function playChime(): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  [440, 660, 880].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(c.destination);
    const start = c.currentTime + i * 0.035;
    gain.gain.setValueAtTime(0.05, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
    osc.start(start);
    osc.stop(start + 0.5);
  });
}

/** promotion 飛行発射時の上昇音 (440 → 1760Hz, 300ms) */
export function playPromote(): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.connect(gain);
  gain.connect(c.destination);
  const now = c.currentTime;
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(1760, now + 0.3);
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  osc.start(now);
  osc.stop(now + 0.4);
}
