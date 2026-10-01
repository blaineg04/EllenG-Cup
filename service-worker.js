const CACHE="elleng-cup-v2.7.8";
const STATIC=[
  "./config.js",
  "./common.js",
  "./manifest.webmanifest",
  "./app-icon-180.png",
  "./app-icon-192.png",
  "./app-icon-512.png",
  "./gator.png"
];

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

  if(req.mode==="navigate"){
    event.respondWith(
      fetch(req,{cache:"no-store"}).then(resp=>{
        const copy=resp.clone();
        caches.open(CACHE).then(cache=>cache.put(url.pathname,copy)).catch(()=>{});
        return resp;
      }).catch(async()=>{
        return (await caches.match(url.pathname)) ||
               (url.pathname.endsWith("/draft.html") ? caches.match("/draft.html") : null) ||
               (url.pathname.endsWith("/captain.html") ? caches.match("/captain.html") : null) ||
               caches.match("/scoring.html");
      })
    );
    return;
  }

  if(["script","style","image","font"].includes(req.destination)){
    event.respondWith(
      fetch(req,{cache:"no-store"}).then(resp=>{
        const copy=resp.clone();
        caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
        return resp;
      }).catch(()=>caches.match(req))
    );
  }
});
