'use strict';
// Two isolated simulated browser subscriptions share a synthetic server state.
// This tests actual common.js subscribe/load code without credentials or live writes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('common.js','utf8');
const subscribeCode=source.slice(source.indexOf('function subscribe(cb)'),source.indexOf('function remaining()'));
const draftCode=source.slice(source.indexOf('let latestLoadRequest=0;'),source.indexOf('function subscribe(cb)'));
const fresh=()=>({picks:[],teams:[{roster:[]},{roster:[]}],golfers:[{name:'Synthetic golfer',team:null}],timerPaused:true,timerLength:60});
function startClient(server){
 const indicator={textContent:'',className:''};
 const classNames=new Set(),draftButtons=[{disabled:false}];
 const strip={classList:{add:v=>classNames.add(v),remove:(...v)=>v.forEach(n=>classNames.delete(n))}};
 let onChange,onStatus,renderCount=0;
 const channel={on(_event,_filter,fn){onChange=fn;return this},subscribe(fn){onStatus=fn;return this}};
 const db={channel:()=>channel,from:()=>({select:()=>({eq:()=>({single:async()=>({data:{state:structuredClone(server.state)},error:null})})})})};
 const ctx={db,cfg:{draftId:'synthetic-draft'},S:fresh(),fresh,console:{error:()=>{}},
  document:{getElementById:id=>id==='connection'?indicator:id==='draftStatusStrip'?strip:null,querySelectorAll:()=>draftButtons}};
 vm.createContext(ctx);
 vm.runInContext(draftCode+'\n'+subscribeCode+'\nthis.connect=subscribe;this.getState=()=>S;',ctx);
 ctx.connect(()=>renderCount++);
 return {status:st=>onStatus(st),change:()=>onChange(),state:()=>ctx.getState(),indicator,strip:classNames,
   buttons:draftButtons,renderCount:()=>renderCount};
}
test('two independent clients catch up on missed picks after disconnect',async()=>{
 const server={state:fresh()};
 const captain=startClient(server),viewer=startClient(server);
 await captain.status('SUBSCRIBED');
 await viewer.status('SUBSCRIBED');
 assert.equal(captain.state().picks.length,0);
 await viewer.status('TIMED_OUT');
 server.state.picks.push({team:0,golfer:0});
 server.state.golfers[0].team=0;
 server.state.teams[0].roster.push(0);
 await captain.change();
 assert.equal(captain.state().picks.length,1);
 assert.equal(viewer.state().picks.length,0);
 assert.equal(viewer.indicator.textContent,'RECONNECTING');
 assert.equal(viewer.buttons[0].disabled,true);
 await viewer.status('SUBSCRIBED');
 assert.equal(viewer.state().picks.length,1);
 assert.equal(viewer.indicator.textContent,'LIVE');
 assert.equal(captain.state().picks.length,viewer.state().picks.length);
 assert.ok(viewer.renderCount()>=2);
});
test('both clients observe a shared deadline after state refresh',async()=>{
 const server={state:fresh()};
 const first=startClient(server),second=startClient(server);
 await first.status('SUBSCRIBED');await second.status('SUBSCRIBED');
 server.state.timerPaused=false;
 server.state.timerEndsAt='2026-11-13T18:00:00Z';
 await first.change();await second.change();
 assert.equal(first.state().timerEndsAt,second.state().timerEndsAt);
 assert.equal(first.state().timerPaused,false);
});

test('a disconnected viewer cannot apply draft changes until resubscribed',async()=>{
 const server={state:fresh()};
 const captain=startClient(server),viewer=startClient(server);
 await captain.status('SUBSCRIBED');
 await viewer.status('SUBSCRIBED');
 await viewer.status('CHANNEL_ERROR');
 server.state.picks.push({team:0,golfer:0});
 server.state.golfers[0].team=0;
 server.state.teams[0].roster.push(0);
 await viewer.change();
 assert.equal(viewer.indicator.textContent,'RECONNECTING');
 assert.equal(viewer.buttons[0].disabled,true);
 assert.equal(viewer.state().picks.length,0,'disconnected client must not apply updates');
 await captain.change();
 assert.equal(captain.state().picks.length,1);
 await viewer.status('SUBSCRIBED');
 assert.equal(viewer.state().picks.length,1,'reconnected client catches up');
 assert.equal(viewer.indicator.textContent,'LIVE');
});

test('reconnect restores the same server timer deadline after missed picks',async()=>{
 const server={state:fresh()};
 const captain=startClient(server),viewer=startClient(server);
 await captain.status('SUBSCRIBED');
 await viewer.status('SUBSCRIBED');
 await viewer.status('TIMED_OUT');
 server.state.timerPaused=false;
 server.state.timerEndsAt='2026-11-13T18:00:30Z';
 server.state.picks.push({team:0,golfer:0});
 server.state.golfers[0].team=0;
 server.state.teams[0].roster.push(0);
 await captain.change();
 assert.equal(viewer.state().timerPaused,true,'offline viewer retains previous timer snapshot');
 assert.equal(viewer.state().picks.length,0,'offline viewer retains previous roster');
 await viewer.status('SUBSCRIBED');
 assert.equal(viewer.state().timerPaused,false);
 assert.equal(viewer.state().timerEndsAt,captain.state().timerEndsAt);
 assert.equal(viewer.state().picks.length,captain.state().picks.length);
 assert.equal(viewer.indicator.textContent,'LIVE');
});

test('two viewers independently catch up after successive server picks',async()=>{
 const server={state:fresh()};
 server.state.golfers.push({name:'Second synthetic golfer',team:null});
 const captain=startClient(server),viewerA=startClient(server),viewerB=startClient(server);
 await captain.status('SUBSCRIBED');
 await viewerA.status('SUBSCRIBED');
 await viewerB.status('SUBSCRIBED');
 await viewerA.status('TIMED_OUT');
 await viewerB.status('CHANNEL_ERROR');
 server.state.picks.push({team:0,golfer:0});
 server.state.golfers[0].team=0;
 server.state.teams[0].roster.push(0);
 await captain.change();
 server.state.picks.push({team:1,golfer:1});
 server.state.golfers[1].team=1;
 server.state.teams[1].roster.push(1);
 await captain.change();
 assert.equal(captain.state().picks.length,2);
 assert.equal(viewerA.state().picks.length,0);
 assert.equal(viewerB.state().picks.length,0);
 await viewerA.status('SUBSCRIBED');
 assert.equal(viewerA.state().picks.length,2);
 assert.equal(viewerB.state().picks.length,0);
 assert.equal(viewerB.buttons[0].disabled,true);
 await viewerB.status('SUBSCRIBED');
 assert.equal(viewerB.state().picks.length,2);
 assert.equal(viewerA.state().teams[0].roster.length,1);
 assert.equal(viewerB.state().teams[1].roster.length,1);
 assert.equal(viewerA.indicator.textContent,'LIVE');
 assert.equal(viewerB.indicator.textContent,'LIVE');
});

test('repeated reconnect notifications do not duplicate server picks',async()=>{
 const server={state:fresh()};
 const viewer=startClient(server);
 await viewer.status('SUBSCRIBED');
 await viewer.status('TIMED_OUT');
 server.state.picks.push({team:0,golfer:0});
 server.state.golfers[0].team=0;
 server.state.teams[0].roster.push(0);
 await viewer.status('SUBSCRIBED');
 await viewer.status('SUBSCRIBED');
 await viewer.change();
 assert.equal(viewer.state().picks.length,1,'repeated reconnect must not duplicate picks');
 assert.equal(viewer.state().teams[0].roster.length,1,'repeated reconnect must not duplicate roster entries');
 assert.equal(viewer.indicator.textContent,'LIVE');
});

test('a reconnecting client stays read-only until the server snapshot arrives',async()=>{
 const server={state:fresh()};
 const viewer=startClient(server);
 await viewer.status('SUBSCRIBED');
 await viewer.status('TIMED_OUT');
 assert.equal(viewer.buttons[0].disabled,true);
 server.state.picks.push({team:0,golfer:0});
 server.state.golfers[0].team=0;
 server.state.teams[0].roster.push(0);
 await viewer.status('SUBSCRIBED');
 assert.equal(viewer.state().picks.length,1);
 assert.equal(viewer.indicator.textContent,'LIVE');
});

test('a second disconnect after recovery prevents stale draft updates',async()=>{
 const server={state:fresh()};
 const viewer=startClient(server);
 await viewer.status('SUBSCRIBED');
 await viewer.status('TIMED_OUT');
 await viewer.status('SUBSCRIBED');
 assert.equal(viewer.indicator.textContent,'LIVE');
 await viewer.status('CHANNEL_ERROR');
 server.state.picks.push({team:0,golfer:0});
 server.state.golfers[0].team=0;
 server.state.teams[0].roster.push(0);
 await viewer.change();
 assert.equal(viewer.indicator.textContent,'RECONNECTING');
 assert.equal(viewer.buttons[0].disabled,true);
 assert.equal(viewer.state().picks.length,0);
 await viewer.status('SUBSCRIBED');
 assert.equal(viewer.state().picks.length,1);
 assert.equal(viewer.indicator.textContent,'LIVE');
});

test('a failed subscription cannot enable controls or apply a new pick',async()=>{
 const server={state:fresh()};
 const viewer=startClient(server);
 await viewer.status('SUBSCRIBED');
 await viewer.status('CLOSED');
 server.state.picks.push({team:0,golfer:0});
 server.state.golfers[0].team=0;
 server.state.teams[0].roster.push(0);
 await viewer.change();
 assert.equal(viewer.indicator.textContent,'RECONNECTING');
 assert.equal(viewer.buttons[0].disabled,true);
 assert.equal(viewer.state().picks.length,0);
 await viewer.status('SUBSCRIBED');
 assert.equal(viewer.state().picks.length,1);
 assert.equal(viewer.indicator.textContent,'LIVE');
});

test('two connected captains converge after consecutive remote picks without duplicate rosters',async()=>{
 const server={state:fresh()};
 server.state.golfers.push({name:'Second synthetic golfer',team:null});
 const captainA=startClient(server),captainB=startClient(server);
 await Promise.all([captainA.status('SUBSCRIBED'),captainB.status('SUBSCRIBED')]);
 server.state.picks.push({team:0,golfer:0});
 server.state.golfers[0].team=0;
 server.state.teams[0].roster.push(0);
 await Promise.all([captainA.change(),captainB.change()]);
 assert.equal(captainA.state().picks.length,1);
 assert.equal(captainB.state().picks.length,1);
 server.state.picks.push({team:1,golfer:1});
 server.state.golfers[1].team=1;
 server.state.teams[1].roster.push(1);
 await Promise.all([captainA.change(),captainB.change()]);
 for(const captain of [captainA,captainB]){
  assert.equal(captain.state().picks.length,2);
  assert.deepEqual(Array.from(captain.state().teams[0].roster),[0]);
  assert.deepEqual(Array.from(captain.state().teams[1].roster),[1]);
  assert.equal(captain.indicator.textContent,'LIVE');
 }
});

test('captain reconnect catches up after two picks and a timer pause',async()=>{
 const server={state:fresh()};
 server.state.golfers.push({name:'Second synthetic golfer',team:null});
 const commissioner=startClient(server),captain=startClient(server);
 await Promise.all([commissioner.status('SUBSCRIBED'),captain.status('SUBSCRIBED')]);
 await captain.status('TIMED_OUT');
 server.state.timerPaused=false;
 server.state.timerEndsAt='2026-11-13T18:00:30Z';
 for(let i=0;i<2;i++){
  server.state.picks.push({team:i,golfer:i});
  server.state.golfers[i].team=i;
  server.state.teams[i].roster.push(i);
  await commissioner.change();
 }
 server.state.timerPaused=true;
 server.state.timerEndsAt=null;
 await commissioner.change();
 assert.equal(captain.state().picks.length,0,'disconnected captain must not speculate about picks');
 assert.equal(captain.buttons[0].disabled,true,'disconnected captain cannot select');
 await captain.status('SUBSCRIBED');
 assert.equal(captain.state().picks.length,2);
 assert.equal(captain.state().timerPaused,true);
 assert.equal(captain.state().timerEndsAt,null);
 assert.deepEqual(Array.from(captain.state().teams[1].roster),[1]);
 assert.equal(captain.indicator.textContent,'LIVE');
});

test('a missed timer resume is recovered with its exact deadline after reconnect',async()=>{
 const server={state:fresh()};
 const commissioner=startClient(server),captain=startClient(server);
 await Promise.all([commissioner.status('SUBSCRIBED'),captain.status('SUBSCRIBED')]);
 await captain.status('CLOSED');
 server.state.timerPaused=false;
 server.state.timerEndsAt='2026-11-13T18:01:00Z';
 await commissioner.change();
 assert.equal(captain.state().timerPaused,true,'offline captain retains old paused snapshot');
 assert.equal(captain.buttons[0].disabled,true,'offline captain cannot draft');
 await captain.status('SUBSCRIBED');
 assert.equal(captain.state().timerPaused,false);
 assert.equal(captain.state().timerEndsAt,commissioner.state().timerEndsAt);
 assert.equal(captain.indicator.textContent,'LIVE');
});
