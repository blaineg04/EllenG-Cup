'use strict';
// Exercise the real scoring-page RSVP loader with deferred, synthetic reads.
// No Supabase connection, credentials, or live tournament data are used.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('scoring.html','utf8');
const start=source.indexOf('let rsvpLoadRequest=0;');
const end=source.indexOf('async function loadGroupAssignments()',start);
assert.ok(start>=0&&end>start,'real RSVP load function must be available');

function deferred(){
 let resolve,reject;
 const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail});
 return {promise,resolve,reject};
}
function harness(eventMode=false){
 const legacy=[],lists=[],counts=[],alerts=[],errors=[];
 let renders=0;
 const ctx={
  user:{id:'captain-a'},rsvps:[],eventRsvpCounts:null,
  EVENT_RSVP_MODE:eventMode,TOURNAMENT_ID:'synthetic-event',DRAFT_ID:'synthetic-draft',
  window:{EllenGEventRsvp:{
   list:()=>{const d=deferred();lists.push(d);return d.promise},
   counts:()=>{const d=deferred();counts.push(d);return d.promise}
  }},
  db:{from:table=>{
   assert.equal(table,'elleng_rsvps');
   return {select:()=>({eq:()=>{
    const d=deferred();legacy.push(d);return d.promise;
   }})};
  }},
  renderRsvp:()=>renders++,
  pushInAppAlert:(...args)=>alerts.push(args),
  console:{error:(...args)=>errors.push(args),warn:()=>{}}
 };
 vm.createContext(ctx);
 vm.runInContext(source.slice(start,end),ctx);
 return {ctx,legacy,lists,counts,alerts,errors,renders:()=>renders,load:()=>ctx.loadRsvps()};
}
test('older legacy RSVP response cannot overwrite a newer attendance refresh',async()=>{
 const h=harness();
 const first=h.load(),second=h.load();
 assert.equal(h.legacy.length,2);
 h.legacy[1].resolve({data:[{user_id:'captain-a',status:'out'}],error:null});
 await second;
 h.legacy[0].resolve({data:[{user_id:'captain-a',status:'playing'}],error:null});
 await first;
 assert.equal(h.ctx.rsvps.length,1);
 assert.equal(h.ctx.rsvps[0].status,'out');
});
test('legacy RSVP response from a signed-out account cannot repopulate attendance',async()=>{
 const h=harness();
 const first=h.load();
 h.ctx.user=null;
 h.ctx.rsvps=[];
 h.legacy[0].resolve({data:[{user_id:'captain-a',status:'playing'}],error:null});
 await first;
 assert.equal(h.ctx.rsvps.length,0);
 assert.equal(h.alerts.length,0);
 assert.match(source,/user=null;rsvpLoadRequest\+\+;rsvps=\[\];eventRsvpCounts=null/,'sign-out must invalidate reads and clear attendance');
});
test('stale legacy read failure cannot clear a newer successful refresh',async()=>{
 const h=harness();
 const first=h.load(),second=h.load();
 h.legacy[1].resolve({data:[{status:'playing'}],error:null});await second;
 h.legacy[0].resolve({data:null,error:{message:'stale network failure'}});await first;
 assert.equal(h.ctx.rsvps[0].status,'playing');
});
test('staged RSVP read from old account cannot overwrite new account counts',async()=>{
 const h=harness(true);
 const first=h.load();
 h.ctx.user={id:'captain-b'};
 const second=h.load();
 h.lists[1].resolve([{user_id:'captain-b',status:'out'}]);
 h.counts[1].resolve({playing:0,out_count:1});await second;
 h.lists[0].resolve([{user_id:'captain-a',status:'playing'}]);
 h.counts[0].resolve({playing:1,out_count:0});await first;
 assert.equal(h.ctx.rsvps[0].user_id,'captain-b');
 assert.equal(h.ctx.eventRsvpCounts.playing,0);
 assert.equal(h.alerts.length,0);
});
test('stale staged RSVP failure cannot erase a newer good attendance snapshot',async()=>{
 const h=harness(true);
 const first=h.load(),second=h.load();
 h.lists[1].resolve([{user_id:'captain-a',status:'playing'}]);
 h.counts[1].resolve({playing:1,out_count:0});await second;
 h.lists[0].reject(new Error('old network error'));
 h.counts[0].resolve({playing:99});await first;
 assert.equal(h.ctx.rsvps.length,1);
 assert.equal(h.ctx.eventRsvpCounts.playing,1);
 assert.equal(h.renders(),0);
 assert.equal(h.alerts.length,0);
});
test('current staged RSVP failure still fails closed and alerts',async()=>{
 const h=harness(true);
 h.ctx.rsvps=[{status:'playing'}];
 h.ctx.eventRsvpCounts={playing:1};
 const pending=h.load();
 h.lists[0].reject(new Error('current network error'));
 h.counts[0].resolve({playing:1});
 await assert.rejects(pending,/current network error/);
 assert.equal(h.ctx.rsvps.length,0);
 assert.equal(h.ctx.eventRsvpCounts,null);
 assert.equal(h.renders(),1);
 assert.equal(h.alerts.length,1);
});
