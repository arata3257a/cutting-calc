const CACHE = "easy-2d-cad-v142";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=142",
  "./app.js?v=142",
  "./handwriting-ai.js?v=142",
  "./handwriting.js?v=142",
  "./manifest.webmanifest",
  "./icon.svg",
  "./data/drawing.json"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url=new URL(event.request.url);
  // Large AI model/CDN files manage their own browser cache. Do not duplicate
  // them in this app's service-worker cache.
  if(url.origin!==self.location.origin) return;
  event.respondWith(
    fetch(event.request,{cache:["document","script","style"].includes(event.request.destination)?"no-store":"default"}).then(response => {
      const copy=response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request,copy));
      return response;
    }).catch(() => caches.match(event.request))
  );
});