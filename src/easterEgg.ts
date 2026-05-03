// R10 Easter Egg: Konami code (↑↑↓↓←→←→BA) で TRON 起動メッセージ +
// 全スケールへ promotion を一気に発火。
//
// 依存を最小化するため、トリガー時のコールバック (onTrigger) を渡す形に。

const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'KeyB', 'KeyA',
];

export function setupKonami(onTrigger: () => void): void {
  let buf: string[] = [];
  window.addEventListener('keydown', (e) => {
    buf.push(e.code);
    if (buf.length > KONAMI.length) buf.shift();
    if (buf.length === KONAMI.length && buf.every((k, i) => k === KONAMI[i])) {
      buf = [];
      onTrigger();
    }
  });
}

/** 中央に「> IDENTITY DISC ACTIVATED」を 2.4s フェード表示 */
export function showEasterEggMessage(): void {
  const msg = document.createElement('div');
  msg.className = 'tron-message';
  msg.textContent = '> IDENTITY DISC ACTIVATED';
  document.body.appendChild(msg);
  setTimeout(() => msg.classList.add('show'), 30);
  setTimeout(() => msg.classList.remove('show'), 2400);
  setTimeout(() => msg.remove(), 3200);
}
