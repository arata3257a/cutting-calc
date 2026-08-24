const CACHE_NAME = 'machining-calc-v6';

const CRITICAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-free.svg',
  './icon-192.png',
  './icon-512.png'
];

const OPTIONAL_ASSETS = [
  'https://cdn.tailwindcss.com'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(
        CRITICAL_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`Failed to cache ${url}:`, err);
          })
        )
      );

      await Promise.all(
        OPTIONAL_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`Optional cache failed ${url}:`, err);
          })
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // ページ本体はネットワーク優先。最新版を優先し、オフライン時だけキャッシュへフォールバック。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put('./index.html', copy);
          });

          return response;
        })
        .catch(() =>
          caches.match('./index.html').then(
            (response) => response || caches.match('./')
          )
        )
    );

    return;
  }

  // その他のファイルはキャッシュ優先
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request).then((response) => {
        if (
          request.method === 'GET' &&
          response &&
          response.status === 200
        ) {
          const copy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, copy);
          });
        }

        return response;
      });
    })
  );
});
