const CACHE="elleng-cup-v2.7.43";
const STATIC=[
  "./config.js?v=2.7.43",
  "./common.js?v=2.7.43",
  "./manifest.webmanifest?v=2.7.43",
  "./app-icon-180.png",
  "./app-icon-192.png",
  "./app-icon-512.png",
  "./gator.png"
];

self.addEventListener("message",event=>{
  if(event.data && event.data.type==="SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(STATIC)).catch(()=>{})
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET") return;

  const url=new URL(req.url);

  // HTML/navigation is always fetched fresh. Never save HTML in the app cache.
  if(req.mode==="navigate" || url.pathname.endsWith(".html") || url.pathname==="/"){
    event.respondWith(fetch(req,{cache:"no-store"}));
    return;
  }

  // Static assets are network-first, with cache only as an offline fallback.
  if(["script","style","image","font"].includes(req.destination) || url.pathname.endsWith(".js") || url.pathname.endsWith(".css")){
    event.respondWith(
      fetch(req,{cache:"no-store"}).then(resp=>{
        if(resp && resp.ok){
          const copy=resp.clone();
          caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
        }
        return resp;
      }).catch(()=>caches.match(req))
    );
  }
});
