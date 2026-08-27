const C='cutting-extra-v17-history';
const A=['./','./index.html','./manifest.json','./conditions.js','./hgs-conditions.js','./ball-conditions.js','./history.js','../icon-192.png','../icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>Promise.all(A.map(x=>c.add(x).catch(()=>null)))))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x))))])));
async function injectHistory(response){
 try{
  const text=await response.text();
  const html=text.includes('history.js')?text:text.replace('</body>','<script src="history.js"></script></body>');
  return new Response(html,{status:response.status,statusText:response.statusText,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'}})
 }catch{return response}
}
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 if(e.request.mode==='navigate'){
  e.respondWith((async()=>{
   try{
    const r=await fetch(e.request);const cp=r.clone();caches.open(C).then(c=>c.put('./index.html',cp)).catch(()=>{});return injectHistory(r)
   }catch{
    const r=await caches.match('./index.html');return r?injectHistory(r):Response.error()
   }
  })());return
 }
 e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)))
});