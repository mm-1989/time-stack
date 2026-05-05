/**
 * time-stack Service Worker
 *
 * 戦略: Stale-While-Revalidate + 起動時 precache + ナビゲーションフォールバック。
 *
 * - precache: install 時にシェル (index, manifest, favicon, og) をまとめて取得。
 *   初回オフライン (= 一度もオンラインで開いていない) には対応できないが、
 *   一度開いていればオフラインでも UI が立ち上がる。
 * - SWR: 通常リソースはキャッシュ即返却 + 並行 fetch でキャッシュ更新。次回が新版になる。
 * - ナビゲーションフォールバック: クエリ違いの URL (?since= / ?until= 等) でも
 *   キャッシュ済み index.html を返し、JS が URL を読み替えて起動する。
 *
 * スコープ: SW を /time-stack/ 配下に置き、同 origin の他プロジェクトへの
 *   レスポンス横取りを構造的に回避 (`feedback_localhost_sw_hijack.md` の教訓)。
 *
 * 更新通知: クライアントから `{type:'SKIP_WAITING'}` メッセージを受けたら
 *   skipWaiting → 即時 active 化。トーストの「更新する」ボタンから使う。
 *
 * dev 環境では一切登録しない (main.ts の import.meta.env.PROD ガード)。
 */
const CACHE_NAME = 'time-stack-v3';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './og.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 個別の失敗で全体を落とさないため、addAll ではなく逐次 try
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[sw] precache failed:', url, err);
          }),
        ),
      );
    })(),
  );
  // 旧 SW のアンロードを待たず即時 active へ進めても良いように。
  // ただしクライアント側のトーストで明示確認するルートも用意するため、
  // skipWaiting は message ハンドラからも呼べるようにしている。
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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 別 origin (Google Fonts 等) は触らない

  // ナビゲーション (HTML ドキュメント取得) はクエリ違いでも index.html へ着地させる。
  // ?since=2000-01-01 のような URL を都度キャッシュすると無駄が増えるし、オフライン時
  // も毎回 miss するため、SPA 的に正規 URL の cache に集約する。
  if (req.mode === 'navigate') {
    event.respondWith(handleNavigation(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh.ok && fresh.type === 'basic') {
      // 実 URL ではなく正規エントリ './' に集約してキャッシュ
      cache.put('./', fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch {
    const cached = (await cache.match('./')) || (await cache.match('./index.html'));
    if (cached) return cached;
    return new Response('<h1>Offline</h1><p>キャッシュなし</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

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
