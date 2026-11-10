(function(root){
 'use strict';
 const KEY='elleng_offline_score_queue_v2',LEGACY='elleng_offline_score_queue_v1';
 const fields=['userId','golferIndex','teamIndex','draftId','tournamentId','eventDate'];
 const same=(a,b)=>fields.every(k=>a[k]===b[k]);
 const valid=x=>x&&typeof x.userId==='string'&&!!x.userId&&Number.isInteger(x.golferIndex)&&x.golferIndex>=0&&Number.isInteger(x.teamIndex)&&x.teamIndex>=0&&typeof x.draftId==='string'&&!!x.draftId&&typeof x.tournamentId==='string'&&!!x.tournamentId&&/^\d{4}-\d{2}-\d{2}$/.test(x.eventDate)&&Number.isInteger(x.hole)&&x.hole>=1&&x.hole<=18&&(x.score===''||(/^\d+$/.test(String(x.score))&&Number(x.score)>=1&&Number(x.score)<=20));
 function createScoreQueue({storage,id=()=>root.crypto.randomUUID()}){
  let inFlight=null;
  function entries(){const raw=storage.getItem(KEY);if(!raw)return[];let q;try{q=JSON.parse(raw)}catch(_){throw Error('Saved offline scores need recovery; storage was left unchanged.')}if(!Array.isArray(q))throw Error('Saved offline scores need recovery; storage was left unchanged.');return q;}
  function write(q){storage.setItem(KEY,JSON.stringify(q));}
  function enqueue(item){
   if(!valid(item))throw Error('Cannot queue an unlinked or invalid score.');
   const q=entries(),prior=q.find(x=>valid(x)&&same(x,item)&&x.hole===item.hole);
   const next={...item,id:id(),status:'pending',queuedAt:new Date().toISOString(),expectedScore:prior?prior.expectedScore:item.expectedScore,expectedUpdatedAt:prior?prior.expectedUpdatedAt:item.expectedUpdatedAt};
   write([...q.filter(x=>!(valid(x)&&same(x,item)&&x.hole===item.hole)),next]);return next;
  }
  function acknowledge(identity,entryId){if(!entryId)return;write(entries().filter(x=>!(same(x,identity)&&x.hole===identity.hole&&x.id===entryId)));}
  function legacyCount(){const raw=storage.getItem(LEGACY);if(!raw)return 0;try{const q=JSON.parse(raw);return Array.isArray(q)?q.length:1}catch(_){return 1}}
  function flush(identity,send){
   if(inFlight)return inFlight;
   inFlight=(async()=>{
    for(const item of entries().filter(x=>valid(x)&&same(x,identity)&&x.status==='pending')){
     // Re-read immediately before sending: a newer local edit may have replaced this entry.
     if(!entries().some(x=>x.id===item.id))continue;
     let result;try{result=await send(item)}catch(_){break}
     const q=entries(),current=q.find(x=>x.id===item.id);if(!current)continue;
     if(result?.ok===true)write(q.filter(x=>x.id!==item.id));
     else if(result?.conflict===true){current.status='conflict';write(q);}
     else break;
    }
   })().finally(()=>{inFlight=null});return inFlight;
  }
  return {entries,enqueue,acknowledge,legacyCount,flush};
 }
 const api={createScoreQueue,sameIdentity:same};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.EllenGOfflineScores=api;
})(typeof window!=='undefined'?window:globalThis);
