const CACHE="elleng-cup-v2.7.2";
const CORE=["./scoring.html","./draft.html","./captain.html","./config.js","./common.js","./manifest.webmanifest","./app-icon-180.png","./app-icon-192.png","./app-icon-512.png"];

self.addEventListener("install",event=>{
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(CORE)).catch(()=>{})
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

  if(req.mode==="navigate"){
    event.respondWith(
      fetch(req).then(resp=>{
        const copy=resp.clone();
        caches.open(CACHE).then(cache=>cache.put("./scoring.html",copy)).catch(()=>{});
        return resp;
      }).catch(()=>caches.match("./scoring.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached=>{
      const network=fetch(req).then(resp=>{
        const copy=resp.clone();
        caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
        return resp;
      }).catch(()=>cached);
      return cached || network;
    })
  );
});
