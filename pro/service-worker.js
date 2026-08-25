const CACHE='machining-pro-v19';
const ASSETS=['./','./index.html','./manifest.json','./icon-pro.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('machining-pro-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
async function withAddon(response){
  if(!response)return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  html=html.replace(/<script[^>]*src=["'][^"']*cast-iron-addon\.js[^"']*["'][^>]*><\/script>/gi,'');
  try{
    const addonRes=await fetch('./cast-iron-addon.js?_pro=19',{cache:'no-store'});
    if(addonRes.ok){
      const addon=await addonRes.text();
      html=html.replace('</body>',`<script>${addon}</script></body>`);
    }
  }catch(e){}
  return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
}
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(e.request.mode==='navigate'){
    e.respondWith((async()=>{
      try{
        const url=new URL(e.request.url);url.searchParams.set('_pro','19');
        const net=await fetch(url.toString(),{cache:'no-store'});
        return withAddon(net);
      }catch(err){
        return withAddon(await caches.match('./index.html')||await caches.match('./'));
      }
    })());
    return;
  }
  e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match(e.request)));
});