const CACHE_NAME = 'machining-calc-v7';

const CRITICAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-free.svg',
  './icon-192.png',
  './icon-512.png',
  './s45c-addon.js'
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

async function withS45CAddon(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const html = await response.text();
  if (html.includes('s45c-addon.js')) {
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }

  const patched = html.replace(
    '</body>',
    '  <script src="s45c-addon.js"></script>\n</body>'
  );

  return new Response(patched, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Page: network first, then inject the S45C beginner add-on.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(async (response) => {
          const patched = await withS45CAddon(response);
          const copy = patched.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put('./index.html', copy);
          });

          return patched;
        })
        .catch(() =>
          caches.match('./index.html').then(
            (response) => response || caches.match('./')
          )
        )
    );

    return;
  }

  // Other files: cache first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (request.method === 'GET' && response && response.status === 200) {
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
