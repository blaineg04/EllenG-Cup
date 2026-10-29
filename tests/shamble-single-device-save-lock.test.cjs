'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('scoring.html','utf8');
test('one-device scoring lock rejects second RPC while first is pending',async()=>{
 const start=source.indexOf('function beginScoreSave('),end=source.indexOf('function renderPairScoring(',start);
 assert.ok(start>=0&&end>start);
 let resolveWrite,writeCount=0;
 const deferred=new Promise(r=>resolveWrite=r);
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:''});return nodes.get(id)};
 const ctx={scoreSaveBusy:false,hole:10,user:{id:'synthetic'},TOURNAMENT_ID:'synthetic',
 canEditTeam:()=>true,$:node,setSyncStatus:()=>{},loadScores:async()=>{},renderAll:()=>{},
 db:{rpc(){writeCount++;return deferred},from(){throw Error('Unsafe table write')}}};
 vm.runInNewContext(source.slice(start,end),ctx);
 const first=ctx.savePlayerShambleScore(0,0,'4');
 const second=ctx.savePlayerShambleScore(0,0,'5');
 assert.equal(writeCount,1,'second RPC must be rejected while first pending');
 assert.match(node('saveMsg').textContent,/already saving/);
 resolveWrite({error:null});await Promise.all([first,second]);
 assert.equal(ctx.scoreSaveBusy,false);
});
