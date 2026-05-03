/**
 * time-stack Service Worker
 *
 * 戦略: Stale-While-Revalidate
 *   - キャッシュがあれば即座に返す → 高速 + オフライン対応
 *   - 並行して fetch で最新を取得しキャッシュ更新 → 次回は新版
 *
 * スコープ: SW を /time-stack/ 配下に置くことで、同 origin の他プロジェクトへの
 *   レスポンス横取りを構造的に回避 (`feedback_localhost_sw_hijack.md` の教訓)。
 *
 * dev 環境では一切登録しない (main.ts で import.meta.env.PROD ガード)。
 */
const CACHE_NAME = 'time-stack-v1';

self.addEventListener('install', () => {
  // 旧 SW のアンロードを待たず即時 active へ
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 別 origin (CDN 等) は触らない
  event.respondWith(staleWhileRevalidate(req));
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || networkFetch;
}
