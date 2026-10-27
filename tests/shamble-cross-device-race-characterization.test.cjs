'use strict';
// Deliberate cross-device race characterization, not a release-gate pass.
// Two clients can independently write derived team scores from stale snapshots.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('scoring.html','utf8');
const start=html.indexOf('async function savePlayerShambleScore(');
const end=html.indexOf('function renderPairScoring(',start);
assert.ok(start>=0&&end>start);
test('two clients cannot overwrite the latest Shamble low-ball score with stale derivation',async()=>{
 const player=new Map([[0,5],[1,5]]);
 let releaseA;const pauseA=new Promise(r=>releaseA=r);
 let aPaused=false;
 let teamScore=5;
 function client(id){
  const ctx={hole:10,scoreSaveBusy:false,user:{id:String(id)},TOURNAMENT_ID:'synthetic',playerScores:[],
   canEditTeam:()=>true,beginScoreSave:()=>true,endScoreSave:()=>{},$:()=>({textContent:''}),
   renderAll:()=>{},teamRosterGolfers:()=>[{index:0},{index:1}],
   loadScores:async()=>{ctx.playerScores=[...player].map(([golfer_index,score])=>({team_index:0,hole:10,golfer_index,score})); if(id==='A'&&!aPaused){aPaused=true;await pauseA;}},
   db:{from(table){return {
    upsert:async row=>{if(table==='elleng_player_hole_scores')player.set(row.golfer_index,row.score);else teamScore=row.score;return {error:null}},
    delete(){throw Error('not used')}
   }}}
  };
  vm.runInNewContext(html.slice(start,end),ctx);return ctx;
 }
 const a=client('A'),b=client('B');
 const aTask=a.savePlayerShambleScore(0,0,'3');
 // A's load is paused before reading the current rows.
 await Promise.resolve();
 await b.savePlayerShambleScore(0,1,'2');
 releaseA();
 await aTask;
 assert.equal(teamScore,2,'team low ball should reflect the committed player scores, not an older client snapshot');
});
