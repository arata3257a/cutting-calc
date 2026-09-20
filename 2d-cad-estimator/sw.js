const CACHE = "easy-2d-cad-estimator-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=est2",
  "./app.js?v=est2",
  "./estimator.js?v=est2",
  "./manifest.webmanifest",
  "./icon.svg",
  "./data/drawing.json"
];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(key=>key!==CACHE&&key.startsWith("easy-2d-cad-estimator-")).map(key=>caches.delete(key))
  )));
  self.clients.claim();
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  event.respondWith(
    fetch(event.request,{cache:["document","script","style"].includes(event.request.destination)?"no-store":"default"}).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      return response;
    }).catch(()=>caches.match(event.request))
  );
});
