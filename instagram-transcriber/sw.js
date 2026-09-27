const CACHE_NAME = 'video-transcriber-v8';
const APP_SHELL = ['./','./index.html?v=8','./app.js?v=8','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install',(event)=>{
  event.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate',(event)=>{
  event.waitUntil(
    caches.keys().then((keys)=>Promise.all(keys.map((k)=>k === CACHE_NAME ? null : caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch',(event)=>{
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isAppCode = sameOrigin && (
    url.pathname.endsWith('/instagram-transcriber/') ||
    url.pathname.endsWith('/instagram-transcriber/index.html') ||
    url.pathname.endsWith('/instagram-transcriber/app.js') ||
    url.pathname.endsWith('/instagram-transcriber/sw.js')
  );

  if (isAppCode) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response)=>{
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache)=>cache.put(event.request,clone));
          return response;
        })
        .catch(()=>caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response)=>{
        if (sameOrigin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache)=>cache.put(event.request,clone));
        }
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});