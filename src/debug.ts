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
