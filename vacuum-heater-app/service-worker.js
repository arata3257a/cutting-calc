const CACHE='vacuum-heater-v16';
const ASSETS=['./','./index.html','./style.css','./app.js','./manifest.json','./icon-192.svg','./icon-512.svg','./trial.js'];

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
    event.respondWith((async()=>{
      try{
        const response=await fetch(request,{cache:'no-store'});
        const text=await response.text();
        const injected=text.includes('trial.js')?text:text.replace('</body>','<script src="./trial.js"></script></body>');
        return new Response(injected,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8'}});
      }catch(err){
        const cached=await caches.match('./index.html');
        if(!cached) throw err;
        const text=await cached.text();
        const injected=text.includes('trial.js')?text:text.replace('</body>','<script src="./trial.js"></script></body>');
        return new Response(injected,{headers:{'Content-Type':'text/html; charset=utf-8'}});
      }
    })());
    return;
  }
  event.respondWith(caches.match(request).then(r=>r||fetch(request)));
});
