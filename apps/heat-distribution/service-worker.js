const CACHE='vacuum-heater-v17';
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
    event.respondWith((async()=>{
      try{
        const response=await fetch(request,{cache:'no-store'});
        const text=await response.text();
        let injected=text;
        if(!injected.includes('password.js')) injected=injected.replace('<script src="app.js"></script>','<script src="password.js"></script><script src="app.js"></script>');
        if(!injected.includes('trial.js')) injected=injected.replace('</body>','<script src="./trial.js"></script></body>');
        return new Response(injected,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8'}});
      }catch(err){
        const cached=await caches.match('./index.html');
        if(!cached) throw err;
        let text=await cached.text();
        if(!text.includes('password.js')) text=text.replace('<script src="app.js"></script>','<script src="password.js"></script><script src="app.js"></script>');
        if(!text.includes('trial.js')) text=text.replace('</body>','<script src="./trial.js"></script></body>');
        return new Response(text,{headers:{'Content-Type':'text/html; charset=utf-8'}});
      }
    })());
    return;
  }
  event.respondWith(caches.match(request).then(r=>r||fetch(request)));
});
