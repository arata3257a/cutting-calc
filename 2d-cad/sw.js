const CACHE = "easy-2d-cad-v160";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=160",
  "./app.js?v=160",
  "./handwriting-simple.js?v=160",
  "./handwriting-ai.js?v=151",
  "./handwriting.js?v=151",
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