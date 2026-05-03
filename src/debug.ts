// 各種 ?debug=... モードと ?audioTest=1 のセットアップ。
// 純粋にデバッグ計測 / 表示のための副作用を集約。

import type { Hud } from './hud';
import type { TimeGrid } from './grid';
import type { ScaleSwitch } from './scaleSwitch';
import { getAudioState, getCallCounts, isMuted, recordAudioSample } from './audio';

/** ?audioTest=1 のとき、3 秒の WAV 合成 → window.__audioBlob にセット。
 *  通常 UI 起動を skip するか判定する真偽値も返す。 */
export function maybeRunAudioTest(params: URLSearchParams): boolean {
  if (!params.has('audioTest')) return false;
  recordAudioSample(3).then((blob) => {
    (window as unknown as { __audioBlob: Blob }).__audioBlob = blob;
    document.body.innerHTML =
      '<div style="color:#0ff;font:14px monospace;padding:40px">audio sample ready (3s WAV in window.__audioBlob)</div>';
  });
  return true;
}

/** ?debug=promotion: 起動 200ms 後に promotion を強制発火 + flight count 計測 */
export function setupPromotionDebug(
  hud: Hud,
  grid: TimeGrid,
  scaleSwitch: ScaleSwitch,
  startPromotion: () => void,
): void {
  setTimeout(() => {
    startPromotion();
    hud.setDebug(`promotion fired @ ${Math.round(performance.now())}ms`);
  }, 200);
  setInterval(() => {
    const n = grid.activePromotionCount;
    const t = scaleSwitch.getButtonCenter('hour');
    hud.setDebug(
      `flights=${n}` + (t ? ` target=(${Math.round(t.x)},${Math.round(t.y)})` : ' target=null'),
    );
  }, 100);
}

/** ?debug=audio: AudioContext.state と play 回数を HUD + console に出力 */
export function setupAudioDebug(hud: Hud): void {
  let lastLine = '';
  setInterval(() => {
    const c = getCallCounts();
    const line =
      `AUDIO: ${getAudioState()} · tick=${c.tick} chime=${c.chime} promote=${c.promote} ` +
      `· muted=${isMuted()}`;
    hud.setDebug(line);
    if (line !== lastLine) {
      console.log('[time-stack/audio]', line);
      lastLine = line;
    }
  }, 200);
}

/** ?debug=perf: fps と 1 フレームあたり render 時間を HUD + console に出力。
 *  返した record(renderMs) を tick 内で grid.render の前後で呼ぶ。 */
export function setupPerfDebug(hud: Hud): { record: (renderMs: number) => void } {
  let frames = 0;
  let renderMsSum = 0;
  let lastSample = performance.now();

  setInterval(() => {
    const now = performance.now();
    const elapsed = now - lastSample;
    const fps = elapsed > 0 ? (frames * 1000) / elapsed : 0;
    const avgRender = frames > 0 ? renderMsSum / frames : 0;
    const line = `PERF: ${fps.toFixed(1)} fps · render=${avgRender.toFixed(2)}ms · frames=${frames}`;
    hud.setDebug(line);
    console.log('[time-stack/perf]', line);
    frames = 0;
    renderMsSum = 0;
    lastSample = now;
  }, 1000);

  return {
    record(renderMs: number) {
      frames++;
      renderMsSum += renderMs;
    },
  };
}
