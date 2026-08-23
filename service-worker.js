const CACHE_NAME = 'cutting-calc-v1';

// オフライン動作用に必ずキャッシュするコアアセット
const ESSENTIAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 取得失敗してもインストールの妨げにしないオプショナルアセット
const OPTIONAL_ASSETS = [
  'https://cdn.tailwindcss.com'
];

// Service Worker のインストール処理
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[Service Worker] 必須アセットをキャッシュ中...');
      // 必須アセットの追加（1つでも失敗すると install は不合格）
      await cache.addAll(ESSENTIAL_ASSETS);

      // オプショナルアセットの追加（個別エラーハンドリングにより失敗を無視）
      console.log('[Service Worker] オプショナルアセットをキャッシュ中...');
      await Promise.all(
        OPTIONAL_ASSETS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (err) {
            console.warn(`[Service Worker] オプショナルアセットの取得に失敗しました (${url}):`, err);
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// 古いキャッシュの削除処理
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] 古いキャッシュを削除:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ネットワークリクエスト時のキャッシュファースト/ネットワークフォールバック制御
self.addEventListener('fetch', (event) => {
  // GETリクエストのみ対象
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // キャッシュが存在する場合はキャッシュを返しつつ、バックグラウンドで最新を取得
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {
          // オフライン時はエラーを無視
        });
        return cachedResponse;
      }

      // キャッシュにない場合はネットワークから取得
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // ページ遷移（HTML要求）かつオフラインの場合、index.htmlを返す
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});