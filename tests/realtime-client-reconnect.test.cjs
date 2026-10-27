'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('scoring.html','utf8');
test('scoring listens to draft-independent score tables',()=>{
 for(const t of ['elleng_team_scores','elleng_player_hole_scores','elleng_pair_hole_scores','elleng_tournaments'])
  assert.match(html,new RegExp('table:["\\x27]'+t+'["\\x27]'));
});
test('realtime subscription refreshes data and reports channel failure',()=>{
 const block=html.slice(html.indexOf('function subscribeLive(){'),html.indexOf('function setMobileNavVisible('));
 assert.match(block,/liveChannel\.subscribe\(status=>/);
 assert.match(block,/status==="SUBSCRIBED"/);
 assert.match(block,/syncLive\(\)\.catch/);
 for(const state of ['CHANNEL_ERROR','TIMED_OUT','CLOSED'])assert.ok(block.includes(state));
 assert.match(block,/setSyncStatus\("error","Realtime reconnecting"\)/);
});

const vm=require('node:vm');
const syncStart=html.indexOf('let syncBusy=false,syncQueued=false;');
const syncEnd=html.indexOf('// Realtime handles live scoring;',syncStart);
assert.ok(syncStart>=0&&syncEnd>syncStart,'scoring refresh implementation exists');
const syncCode=html.slice(syncStart,syncEnd)+'\nthis.refresh=syncLive;';
function scoringRefreshHarness(){
 let resolveFirst,reads=0,scoreLoads=0;
 const statuses=[];
 const firstRead=new Promise(resolve=>{resolveFirst=resolve});
 const ctx={
  user:{id:'captain-a'},isCommissioner:false,TOURNAMENT_ID:'isolated-event',DRAFT_ID:'isolated-draft',
  tournamentArchives:[{}],document:{querySelector:()=>null},structuredClone,console:{error:()=>{}},
  db:{
   from(table){
    return {select:()=>({eq:()=>({single:()=>{
     if(table==='elleng_tournaments'){
      reads++;
      return reads===1?firstRead:Promise.resolve({data:{name:'Test event'},error:null});
     }
     return Promise.resolve({data:null,error:null});
    }})})};
   },
   functions:{invoke:async()=>({data:{linked:false}})}
  },
  loadScores:async()=>{scoreLoads++},loadRsvps:async()=>{},
  loadGroupAssignments:async()=>{},loadTournamentArchives:async()=>{},
  setSyncStatus:(kind,label)=>statuses.push({kind,label}),
  renderAll:()=>{},activeTeamCount:()=>0
 };
 vm.createContext(ctx);vm.runInContext(syncCode,ctx);
 return {ctx,refresh:()=>ctx.refresh(),finishFirst:()=>resolveFirst({data:{name:'Test event'},error:null}),
  reads:()=>reads,scoreLoads:()=>scoreLoads,statuses};
}
test('Realtime reconnect during a busy scoring poll schedules one authoritative follow-up',async()=>{
 const h=scoringRefreshHarness();
 const first=h.refresh();
 assert.equal(h.reads(),1);
 await Promise.all([h.refresh(),h.refresh(),h.refresh()]);
 assert.equal(h.reads(),1,'overlapping events must coalesce rather than race');
 h.finishFirst();await first;
 // The queued refresh starts in the first refresh finally block.
 for(let i=0;i<5&&h.scoreLoads()<2;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.reads(),2,'a reconnect arriving mid-poll must not be discarded');
 assert.equal(h.scoreLoads(),2,'follow-up must reload scoring data');
 assert.equal(h.statuses.at(-1)?.kind,'saved');
});
test('queued scoring refresh does not fetch data after sign-out',async()=>{
 const h=scoringRefreshHarness();
 const first=h.refresh();
 await h.refresh();
 h.ctx.user=null;
 h.finishFirst();await first;
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.reads(),1,'queued catch-up must honor signed-out state');
});
