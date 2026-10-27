'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('scoring.html','utf8');
test('one-device score submission lock prevents a second concurrent score write',async()=>{
 const start=source.indexOf('function beginScoreSave(');
 const end=source.indexOf('function renderPairScoring(',start);
 assert.ok(start>=0&&end>start);
 let resolveWrite,writeCount=0;
 const deferred=new Promise(r=>{resolveWrite=r});
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:''});return nodes.get(id)};
 const ctx={
  scoreSaveBusy:false,hole:10,playerScores:[],user:{id:'synthetic'},
  TOURNAMENT_ID:'synthetic',canEditTeam:()=>true,$:node,
  setSyncStatus:()=>{},loadScores:async()=>{},renderAll:()=>{},
  teamRosterGolfers:()=>[{index:0}],
  db:{from(table){return {upsert(){writeCount++;return deferred},delete(){return {eq(){return this},then(res,rej){writeCount++;return deferred.then(res,rej)}}}}}},
  Date
 };
 vm.runInNewContext(source.slice(start,end),ctx);
 const first=ctx.savePlayerShambleScore(0,0,'4');
 const second=ctx.savePlayerShambleScore(0,0,'5');
 assert.equal(writeCount,1,'second write must be rejected while first pending');
 assert.match(node('saveMsg').textContent,/already saving/);
 resolveWrite({error:null});await Promise.all([first,second]);
 assert.equal(ctx.scoreSaveBusy,false,'save lock must be released');
});
