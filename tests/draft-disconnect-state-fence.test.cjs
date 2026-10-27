'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
// Exercise actual load + subscribe code with an isolated synthetic server.
const src=fs.readFileSync('common.js','utf8');
const a=src.indexOf('let latestLoadRequest=0;'),b=src.indexOf('async function save()',a);
const c=src.indexOf('function subscribe(cb)'),d=src.indexOf('function remaining()',c);
assert.ok(a>=0&&b>a&&c>b&&d>c);
const code=src.slice(a,b)+'\n'+src.slice(c,d)+'\nthis.connect=subscribe;this.state=()=>S;';
const fresh=()=>({picks:[],teams:[],golfers:[],timerPaused:true});
function start(server){
 let status,change,rendered=0,delay=false;
 const pending=[],indicator={textContent:'',className:''},buttons=[{disabled:false}];
 const strip={classList:{add:()=>{},remove:()=>{}}};
 const channel={on(_kind,_filter,fn){change=fn;return this},subscribe(fn){status=fn;return this}};
 const db={channel:()=>channel,from:()=>({select:()=>({eq:()=>({single:()=>{
  const response={data:{state:structuredClone(server.state)},error:null};
  return delay?new Promise(resolve=>pending.push(()=>resolve(response))):Promise.resolve(response);
 }})})})};
 const ctx={db,cfg:{draftId:'synthetic-only'},S:fresh(),fresh,console:{error:()=>{}},
  document:{getElementById:id=>id==='connection'?indicator:id==='draftStatusStrip'?strip:null,
   querySelectorAll:()=>buttons}};
 vm.createContext(ctx);vm.runInContext(code,ctx);ctx.connect(()=>rendered++);
 return {emit:s=>status(s),change:()=>change(),state:()=>ctx.state(),defer:x=>delay=x,
  resolve:()=>{const next=pending.shift();assert.ok(next);next()},
  pending:()=>pending.length,rendered:()=>rendered,indicator,buttons};
}
test('in-flight realtime change cannot overwrite state after disconnect',async()=>{
 const server={state:fresh()},h=start(server);
 await h.emit('SUBSCRIBED');
 h.defer(true);server.state.picks.push({golfer:0,team:0});
 const old=h.change();assert.equal(h.pending(),1);
 await h.emit('TIMED_OUT');h.resolve();await old;
 assert.equal(h.state().picks.length,0,'stale response must not mutate state');
 assert.equal(h.indicator.textContent,'RECONNECTING');
 assert.equal(h.rendered(),1);assert.equal(h.buttons[0].disabled,true);
 h.defer(false);await h.emit('SUBSCRIBED');
 assert.equal(h.state().picks.length,1,'reconnect must catch up');
 assert.equal(h.indicator.textContent,'LIVE');assert.equal(h.rendered(),2);
});
test('in-flight subscription catch-up cannot mutate state after disconnect',async()=>{
 const server={state:fresh()},h=start(server);
 server.state.picks.push({golfer:0,team:0});h.defer(true);
 const old=h.emit('SUBSCRIBED');assert.equal(h.pending(),1);
 await h.emit('CLOSED');h.resolve();await old;
 assert.equal(h.state().picks.length,0,'stale catch-up must not mutate state');
 assert.equal(h.indicator.textContent,'RECONNECTING');assert.equal(h.rendered(),0);
 h.defer(false);server.state.picks.push({golfer:1,team:1});
 await h.emit('SUBSCRIBED');
 assert.equal(h.state().picks.length,2);assert.equal(h.rendered(),1);
 assert.equal(h.indicator.textContent,'LIVE');
});

test('superseded Realtime refresh never renders an older draft response',async()=>{
 const server={state:fresh()},h=start(server);
 await h.emit('SUBSCRIBED');
 h.defer(true);server.state.picks.push({golfer:0,team:0});
 const old=h.change(),latest=h.change();
 assert.equal(h.pending(),2);
 h.resolve();await old;
 assert.equal(h.rendered(),1,'superseded response must not render');
 assert.equal(h.state().picks.length,0);
 h.resolve();await latest;
 assert.equal(h.rendered(),2);
 assert.equal(h.state().picks.length,1);
});

test('superseded subscription catch-up cannot announce LIVE before a newer read',async()=>{
 const server={state:fresh()},h=start(server);
 h.defer(true);
 const catchup=h.emit('SUBSCRIBED'),latest=h.change();
 assert.equal(h.pending(),2);
 h.resolve();await catchup;
 assert.equal(h.indicator.textContent,'SYNCING');
 assert.equal(h.rendered(),0);
 h.resolve();await latest;
 assert.equal(h.indicator.textContent,'LIVE');
 assert.equal(h.rendered(),1);
});

test('stale refresh from prior connection cannot overwrite recovered snapshot',async()=>{
 const server={state:fresh()},h=start(server);
 await h.emit('SUBSCRIBED');
 h.defer(true);
 server.state.picks.push({golfer:0,team:0});
 const stale=h.change();
 assert.equal(h.pending(),1);
 await h.emit('CHANNEL_ERROR');
 h.defer(false);
 server.state.picks.push({golfer:1,team:1});
 await h.emit('SUBSCRIBED');
 assert.equal(h.state().picks.length,2);
 assert.equal(h.indicator.textContent,'LIVE');
 h.resolve();await stale;
 assert.equal(h.state().picks.length,2,'old connection response must not replace recovered state');
 assert.equal(h.indicator.textContent,'LIVE');
});

test('failed prior-connection catch-up cannot change a newer LIVE snapshot',async()=>{
 const server={state:fresh()},h=start(server);
 h.defer(true);
 server.state.picks.push({golfer:0,team:0});
 const stale=h.emit('SUBSCRIBED');
 assert.equal(h.pending(),1);
 await h.emit('TIMED_OUT');
 h.defer(false);
 server.state.picks.push({golfer:1,team:1});
 await h.emit('SUBSCRIBED');
 assert.equal(h.state().picks.length,2);
 assert.equal(h.indicator.textContent,'LIVE');
 h.resolve();await stale;
 assert.equal(h.state().picks.length,2);
 assert.equal(h.indicator.textContent,'LIVE');
});

test('out-of-order refreshes after reconnect keep the newest snapshot',async()=>{
 const server={state:fresh()},h=start(server);
 await h.emit('SUBSCRIBED');
 await h.emit('CHANNEL_ERROR');
 h.defer(true);
 server.state.picks.push({golfer:0,team:0});
 const older=h.emit('SUBSCRIBED');
 assert.equal(h.pending(),1);
 server.state.picks.push({golfer:1,team:1});
 const newer=h.change();
 assert.equal(h.pending(),2);
 h.resolve();await older;
 assert.equal(h.state().picks.length,0,'superseded reconnect read cannot render');
 assert.equal(h.indicator.textContent,'SYNCING');
 h.resolve();await newer;
 assert.equal(h.state().picks.length,2);
 assert.equal(h.indicator.textContent,'LIVE');
});
