// Old public EXTRA/PRO app is retired. Redirect to server-side authentication.
const NEW_URL='https://extra.hikaru.info/';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const names=await caches.keys();
 await Promise.all(names.filter(name=>/^(cutting-extra-|cutting-pro-|machining-pro-)/.test(name)).map(name=>caches.delete(name)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate')event.respondWith(Response.redirect(NEW_URL,302));
});
