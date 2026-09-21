const CACHE = "easy-2d-cad-estimator-trial-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=trial1",
  "./app.js?v=trial1",
  "./estimator.js?v=trial1",
  "./trial.js?v=trial1",
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
