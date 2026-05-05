// PWA 更新検知トースト。
// 新しい SW が installed まで進んだ瞬間 (既に旧 SW が controller の場合) に「更新あり」を
// 通知し、クリックで SKIP_WAITING + reload を発火する。

import { t } from './i18n';

/**
 * Service Worker を登録し、更新検知時にトーストを表示する。
 * 本番ビルドでのみ呼ぶ (main.ts で import.meta.env.PROD ガード)。
 */
export function registerSwWithUpdateToast(): void {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then((reg) => {
      // 既に waiting がいる場合 (= 前回ロード時に新版が install 済みで未 active) は即トースト
      if (reg.waiting && navigator.serviceWorker.controller) {
        showUpdateToast(reg.waiting);
      }
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          // 新規 SW が installed まで進み、かつ現在 controller がいる
          // (= 既に旧 SW で動いている) ときだけ「更新あり」をユーザに見せる。
          // 初回登録 (controller=null) の場合はトーストせずに静かに有効化。
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast(next);
          }
        });
      });
    })
    .catch(() => {
      /* 登録失敗 (= 非対応 / blocked) は無視 */
    });

  // controller が変わったら 1 度だけリロード (SKIP_WAITING の効果を反映)
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

function showUpdateToast(waitingWorker: ServiceWorker): void {
  // 二重表示防止
  if (document.querySelector('.update-toast')) return;

  const wrap = document.createElement('div');
  wrap.className = 'update-toast';
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');

  const msg = document.createElement('span');
  msg.className = 'update-toast__msg';
  msg.textContent = t('update.available');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'update-toast__btn';
  btn.textContent = t('update.reload');
  btn.addEventListener('click', () => {
    btn.disabled = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    // controllerchange でリロードされる。フェールセーフで 2.5s 後にも reload。
    setTimeout(() => location.reload(), 2500);
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'update-toast__close';
  close.setAttribute('aria-label', t('update.dismiss'));
  close.textContent = '×';
  close.addEventListener('click', () => wrap.remove());

  wrap.appendChild(msg);
  wrap.appendChild(btn);
  wrap.appendChild(close);
  document.body.appendChild(wrap);

  requestAnimationFrame(() => wrap.classList.add('show'));
}
