const CACHE='machining-pro-v8';
const ASSETS=['./','./index.html','./manifest.json','./icon-pro.svg','./data/cwlb-verified.json','./cast-iron-addon.js'];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k.startsWith('machining-pro-')&&k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

async function withCastIronAddon(response){
  if(!response) return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return response;
  const html=await response.text();
  const patched=html.includes('cast-iron-addon.js')?html:html.replace('</body>','<script src="./cast-iron-addon.js"></script></body>');
  return new Response(patched,{status:response.status,statusText:response.statusText,headers:response.headers});
}

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  if(e.request.mode==='navigate'){
    e.respondWith((async()=>{
      try{
        const net=await fetch(e.request,{cache:'no-store'});
        if(net&&net.status===200){caches.open(CACHE).then(c=>c.put('./index.html',net.clone()));}
        return withCastIronAddon(net);
      }catch(err){
        const cached=await caches.match('./index.html')||await caches.match('./');
        return withCastIronAddon(cached);
      }
    })());
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{
    if(res&&res.status===200){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}
    return res;
  }).catch(()=>cached)));
});
