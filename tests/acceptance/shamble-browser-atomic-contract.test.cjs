'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('scoring.html','utf8'),start=html.indexOf('async function savePlayerShambleScore('),end=html.indexOf('function renderPairScoring(',start);
assert.ok(start>=0&&end>start);
test('Shamble browser makes one atomic server call and no direct score-table writes',async()=>{
 const calls=[],node={textContent:''};
 const ctx={hole:10,user:{id:'synthetic'},TOURNAMENT_ID:'synthetic',canEditTeam:()=>true,beginScoreSave:()=>true,endScoreSave:()=>{},$:()=>node,
  db:{from:()=>{throw Error('Unsafe separate table write')},rpc:async(name,payload)=>{calls.push({name,payload});return {data:2,error:null}}},
  loadScores:async()=>{},renderAll:()=>{}};
 vm.runInNewContext(html.slice(start,end),ctx);
 await ctx.savePlayerShambleScore(0,0,'3');
 assert.equal(calls.length,1);assert.equal(calls[0].name,'elleng_test_authorized_shamble');
 assert.equal(calls[0].payload.p_hole,10);assert.equal(calls[0].payload.p_score,3);
});
test('Shamble browser fails closed on unavailable RPC and does not write raw tables',async()=>{
 let message='',writes=0;
 const ctx={hole:10,user:{id:'synthetic'},TOURNAMENT_ID:'synthetic',canEditTeam:()=>true,beginScoreSave:()=>true,endScoreSave:()=>{},$:()=>({set textContent(v){message=v}}),
 db:{from:()=>{writes++;throw Error('Unsafe write')},rpc:async()=>({error:{message:'Function not deployed'}})},
 loadScores:async()=>{},renderAll:()=>{}};
 vm.runInNewContext(html.slice(start,end),ctx);
 await ctx.savePlayerShambleScore(0,0,'3');
 assert.equal(writes,0);assert.match(message,/Function not deployed/);
});
