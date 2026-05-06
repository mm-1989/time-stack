// タッチデバイス向けのジェスチャ。
// pointer:coarse でのみ有効化し、マウス操作 (パララックス / hover tooltip) と干渉しない。

export interface GestureHandlers {
  /** 水平方向のフリックで前後スケールに切替 */
  onSwipeNext?(): void;
  onSwipePrev?(): void;
}

interface GestureOpts {
  /** スワイプ確定に必要な水平距離 (px) */
  thresholdPx?: number;
  /** 水平 vs 垂直の比。dx > dy * ratio でないと水平とみなさない */
  horizontalRatio?: number;
  /** 全動作の最大時間 (ms)。これを越えるとフリックではなくドラッグ扱いで無効 */
  maxDurationMs?: number;
}

/**
 * canvas (もしくは任意要素) にタッチジェスチャを束ねる。
 * mouse / pen は無視 (= touch のみ反応) してマウス操作を一切壊さない。
 */
export function bindGestures(
  target: HTMLElement,
  handlers: GestureHandlers,
  opts: GestureOpts = {},
): void {
  const threshold = opts.thresholdPx ?? 60;
  const ratio = opts.horizontalRatio ?? 1.4;
  const maxDuration = opts.maxDurationMs ?? 700;

  let activeId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startT = 0;

  target.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    if (activeId !== null) return;
    activeId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startT = performance.now();
    // pointer を target に固定する。指が overlay (Σ ボタン / sound indicator) や
    // canvas 外へ流れても pointermove / pointerup は target に届くようになる。
    // これがないと右スワイプ終端で右上 overlay に乗った瞬間 pointerup が他要素に行き、
    // gesture が検出されない (= 「右スワイプが時々動作しない」現象の主因)。
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // 古いブラウザ等で setPointerCapture 非対応のときは握り潰す (劣化モード)
    }
  });

  target.addEventListener('pointerup', (e) => {
    if (e.pointerId !== activeId) return;
    activeId = null;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dt = performance.now() - startT;
    if (dt > maxDuration) return;
    if (Math.abs(dx) < threshold) return;
    if (Math.abs(dx) < Math.abs(dy) * ratio) return;
    // カルーセル慣習に揃える: 指を左へ動かす = 次が出てくる、右 = 前へ戻る。
    // (iOS 写真アプリ / Instagram ストーリー / Tab swipe 等と同じ向き)
    if (dx < 0) handlers.onSwipeNext?.();
    else handlers.onSwipePrev?.();
  });

  // システム割り込み (通話、システム gesture 横取り等) のみ cancel として扱う。
  // pointerleave は使わない: 指が canvas 外に出ただけで gesture を殺すと、
  // overlay や画面端に到達する正規スワイプも巻き添えで失敗する。
  target.addEventListener('pointercancel', (e) => {
    if (e.pointerId === activeId) activeId = null;
  });
}
