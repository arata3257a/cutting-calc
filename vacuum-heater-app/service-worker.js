const CACHE='vacuum-heater-v19';
const ASSETS=['./','./index.html','./style.css','./app.js','./manifest.json','./icon-192.svg','./icon-512.svg','./trial.js','./password.js'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request,{cache:'no-store'}).catch(()=>caches.match('./index.html'))
    );
    return;
  }
  event.respondWith(
    fetch(request).catch(()=>caches.match(request))
  );
});
