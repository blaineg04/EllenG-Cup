const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','service-worker.js'),'utf8');
function harness(){
  const handlers={};
  const deleted=[];
  const urls=[];
  const cacheKeys=['elleng-cup-v2.7.1','elleng-cup-v2.7.91','unrelated-site-cache'];
  const self={
    location:{origin:'https://cup.example'},
    skipWaiting(){},
    clients:{claim:async()=>{}},
    addEventListener:(name,handler)=>{handlers[name]=handler;}
  };
  const caches={
    keys:async()=>cacheKeys,
    delete:async key=>{deleted.push(key);return true;},
    open:async()=>({addAll:async()=>{},put:async()=>{}}),
    match:async()=>undefined
  };
  const fetch=async req=>{urls.push(req.url);return {ok:true,clone(){return this;}};};
  vm.runInNewContext(source,{self,caches,fetch,URL,Response,Promise},{timeout:1000});
  return {handlers,deleted,urls};
}
test('activation deletes only old EllenG Cup caches',async()=>{
 const h=harness();
 let work;
 h.handlers.activate({waitUntil:p=>{work=p;}});
 await work;
 assert.deepEqual(h.deleted,['elleng-cup-v2.7.1']);
});
test('cross-origin API requests bypass PWA fetch interceptor',()=>{
 const h=harness();
 let intercepted=false;
 h.handlers.fetch({request:{method:'GET',url:'https://backend.supabase.co/rest/v1/scores',mode:'cors',destination:''},respondWith:()=>{intercepted=true;}});
 assert.equal(intercepted,false);
});
test('non-GET requests bypass PWA fetch interceptor',()=>{
 const h=harness();
 let intercepted=false;
 h.handlers.fetch({request:{method:'POST',url:'https://cup.example/api',mode:'cors',destination:''},respondWith:()=>{intercepted=true;}});
 assert.equal(intercepted,false);
});
test('same-origin navigation is always handled network-only',async()=>{
 const h=harness();
 let response;
 h.handlers.fetch({request:{method:'GET',url:'https://cup.example/scoring.html',mode:'navigate',destination:'document'},respondWith:p=>{response=p;}});
 await response;
 assert.deepEqual(h.urls,['https://cup.example/scoring.html']);
});
