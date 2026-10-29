'use strict';
// Simulates atomic server operation using a serialized queue; database-level
// two-session PostgreSQL test separately establishes locking behavior.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('scoring.html','utf8');
const start=html.indexOf('async function savePlayerShambleScore('),end=html.indexOf('function renderPairScoring(',start);
assert.ok(start>=0&&end>start);
test('two browser clients invoke serialized atomic RPC; stale snapshots cannot overwrite team score',async()=>{
 const scores=new Map([[0,5],[1,5]]);let teamScore=5,queue=Promise.resolve(),calls=0;
 let releaseFirst,signalFirst;const firstPending=new Promise(r=>releaseFirst=r),firstEntered=new Promise(r=>signalFirst=r);
 function client(id){
  const ctx={hole:10,TOURNAMENT_ID:'synthetic',canEditTeam:()=>true,beginScoreSave:()=>true,endScoreSave:()=>{},$:()=>({textContent:''}),
   loadScores:async()=>{},renderAll:()=>{},
   db:{from(){throw Error('Direct score table writes prohibited')},
    rpc(name,payload){
     assert.equal(name,'elleng_test_authorized_shamble');calls++;
     const task=queue.then(async()=>{
      if(id==='A'){signalFirst();await firstPending;}
      scores.set(payload.p_golfer_index,payload.p_score);
      teamScore=Math.min(...scores.values());
      return {data:teamScore,error:null};
     });
     queue=task.then(()=>undefined);
     return task;
    }}};
  vm.runInNewContext(html.slice(start,end),ctx);return ctx;
 }
 const a=client('A'),b=client('B');
 const aTask=a.savePlayerShambleScore(0,0,'3');
 await firstEntered;
 const bTask=b.savePlayerShambleScore(0,1,'2');
 releaseFirst();
 await Promise.all([aTask,bTask]);
 assert.equal(calls,2);assert.equal(teamScore,2);
});
