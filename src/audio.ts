// 軽量 WebAudio エフェクト。WebAudio はユーザインタラクション後にしか音を出せないため、
// AudioContext は遅延生成。デフォルトはミュート (UX を邪魔しない)。
//
// 構成: 各音 (tick/chime/promote) を「scheduler 関数」として抽出し、ライブ用
// AudioContext と OfflineAudioContext (=録音) の両方で同じスケジューリングを再利用。

let ctx: AudioContext | null = null;
// デフォルトはサウンド ON。WebAudio の autoplay policy により、初回ユーザ
// インタラクション (キー押下/クリック) までは AudioContext が suspended で
// 実質的に音が出ないが、それ以降は ON の挙動になる。
let muted = false;

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

// === Scheduler 関数 (live と offline で共用) ===

function scheduleTick(c: BaseAudioContext, when: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  osc.connect(gain);
  gain.connect(c.destination);
  gain.gain.setValueAtTime(0.035, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
  osc.start(when);
  osc.stop(when + 0.07);
}

function scheduleChime(c: BaseAudioContext, when: number): void {
  [440, 660, 880].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(c.destination);
    const start = when + i * 0.035;
    gain.gain.setValueAtTime(0.05, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
    osc.start(start);
    osc.stop(start + 0.5);
  });
}

function schedulePromote(c: BaseAudioContext, when: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.connect(gain);
  gain.connect(c.destination);
  osc.frequency.setValueAtTime(440, when);
  osc.frequency.exponentialRampToValueAtTime(1760, when + 0.3);
  gain.gain.setValueAtTime(0.06, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.35);
  osc.start(when);
  osc.stop(when + 0.4);
}

// === Live 再生 API ===

export function playTick(): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  scheduleTick(c, c.currentTime);
}

export function playChime(): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  scheduleChime(c, c.currentTime);
}

export function playPromote(): void {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  schedulePromote(c, c.currentTime);
}

// === オフライン録音 (テスト用) ===

/**
 * テスト用に 3 秒の WAV を合成して Blob で返す。
 * scheduler を再利用して: 0s で tick、0.5s で 2 連 tick、1s で chime、2s で promote、
 * を含む 3 秒間のサンプル。「実際に音が鳴っているか」を WAV ファイル経由で検証可能。
 */
export async function recordAudioSample(durationSec = 3): Promise<Blob> {
  const sampleRate = 44100;
  const Ctor = (window as unknown as {
    OfflineAudioContext?: typeof OfflineAudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  });
  const C = Ctor.OfflineAudioContext ?? Ctor.webkitOfflineAudioContext;
  if (!C) throw new Error('OfflineAudioContext unavailable');
  const offline = new C(2, Math.floor(sampleRate * durationSec), sampleRate);

  scheduleTick(offline, 0);
  scheduleTick(offline, 0.4);
  scheduleTick(offline, 0.8);
  scheduleChime(offline, 1.2);
  schedulePromote(offline, 2.0);

  const buffer = await offline.startRendering();
  return audioBufferToWav(buffer);
}

/** AudioBuffer → 16-bit PCM WAV Blob (RIFF header + interleaved samples)。 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const bytesPerSample = 2;
  const dataSize = samples * numChannels * bytesPerSample;
  const totalSize = 44 + dataSize;
  const ab = new ArrayBuffer(totalSize);
  const view = new DataView(ab);
  let off = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off++, s.charCodeAt(i));
  };
  const write32 = (n: number) => {
    view.setUint32(off, n, true);
    off += 4;
  };
  const write16 = (n: number) => {
    view.setUint16(off, n, true);
    off += 2;
  };
  // RIFF chunk
  writeStr('RIFF');
  write32(totalSize - 8);
  writeStr('WAVE');
  // fmt sub-chunk
  writeStr('fmt ');
  write32(16); // PCM chunk size
  write16(1); // PCM format
  write16(numChannels);
  write32(sampleRate);
  write32(sampleRate * numChannels * bytesPerSample); // byte rate
  write16(numChannels * bytesPerSample); // block align
  write16(16); // bits per sample
  // data sub-chunk
  writeStr('data');
  write32(dataSize);
  // PCM samples (interleaved)
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}
