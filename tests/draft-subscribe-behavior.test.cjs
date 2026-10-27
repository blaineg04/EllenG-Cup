'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('common.js','utf8');
const start=source.indexOf('function subscribe(cb)');
const end=source.indexOf('function remaining()',start);
assert.ok(start>0&&end>start);
const subscribeSource=source.slice(start,end);
function harness(){
 const connection={textContent:'',className:''};
 const classes=new Set();
 const strip={classList:{remove:(...names)=>names.forEach(n=>classes.delete(n)),add:n=>classes.add(n)}};
 let callback,handler,refreshes=0,rendered=0,rejectRefresh=false,holdRefresh=false;
 const pending=[];
 const pickButton={disabled:false};
 const channel={on(_event,_filter,fn){handler=fn;return this},subscribe(fn){callback=fn;return this}};
 const ctx={db:{channel:()=>channel},cfg:{draftId:'synthetic-only'},
   document:{getElementById:id=>id==='connection'?connection:id==='draftStatusStrip'?strip:null,querySelectorAll:()=>[pickButton]},
   console:{error:()=>{}},load:async()=>{refreshes++;if(holdRefresh)await new Promise(resolve=>pending.push(resolve));if(rejectRefresh)throw Error('synthetic outage')}};
 vm.createContext(ctx);
 vm.runInContext(subscribeSource+';this.connect=subscribe;',ctx);
 ctx.connect(()=>rendered++);
 return {connection,classes,emit:st=>callback(st),change:()=>handler(),stats:()=>({refreshes,rendered,buttonDisabled:pickButton.disabled}),fail:()=>{rejectRefresh=true},pause:()=>{holdRefresh=true},resume:()=>{holdRefresh=false;pending.splice(0).forEach(resolve=>resolve())}};
}
test('synthetic Realtime subscribe refreshes on connect and reconnect',async()=>{
 const h=harness();
 await h.emit('SUBSCRIBED');
 assert.equal(h.stats().refreshes,1);
 assert.equal(h.stats().rendered,1);
 assert.equal(h.connection.textContent,'LIVE');
 assert.ok(h.classes.has('status-live'));
 await h.emit('TIMED_OUT');
 assert.equal(h.connection.textContent,'RECONNECTING');
 assert.ok(h.classes.has('status-offline'));
 await h.emit('SUBSCRIBED');
 assert.equal(h.stats().refreshes,2);
 assert.equal(h.stats().rendered,2);
});
test('failed catch-up does not show LIVE',async()=>{
 const h=harness();h.fail();await h.emit('SUBSCRIBED');
 assert.equal(h.connection.textContent,'SYNC ERROR');
 assert.ok(h.classes.has('status-offline'));
 assert.equal(h.stats().rendered,0);
});
test('Realtime change refreshes synthetic draft state',async()=>{
 const h=harness();await h.change();
 assert.equal(h.stats().refreshes,1);
 assert.equal(h.stats().rendered,1);
});

test('failed Realtime event refresh visibly reports out-of-sync state',async()=>{
 const h=harness();await h.emit('SUBSCRIBED');h.fail();await h.change();
 assert.equal(h.connection.textContent,'SYNC ERROR');
 assert.ok(h.classes.has('status-offline'));
 assert.equal(h.stats().rendered,1);
});

test('lost Realtime connection immediately disables pending captain selection buttons',async()=>{
 const h=harness();await h.emit('SUBSCRIBED');
 await h.emit('CHANNEL_ERROR');
 assert.equal(h.stats().buttonDisabled,true);
});

test('subscription shows SYNCING until fresh state finishes loading',async()=>{
 const h=harness();const inProgress=h.emit('SUBSCRIBED');
 assert.equal(h.connection.textContent,'SYNCING');
 await inProgress;
 assert.equal(h.connection.textContent,'LIVE');
 assert.ok(h.classes.has('status-live'));
});

test('a delayed subscription refresh cannot restore LIVE after disconnect',async()=>{
 const h=harness();h.pause();
 const oldConnect=h.emit('SUBSCRIBED');
 await Promise.resolve();
 await h.emit('TIMED_OUT');
 h.resume();await oldConnect;
 assert.equal(h.connection.textContent,'RECONNECTING');
 assert.ok(h.classes.has('status-offline'));
 assert.equal(h.stats().rendered,0);
 assert.equal(h.stats().buttonDisabled,true);
});
test('a delayed realtime event cannot repaint stale draft after channel failure',async()=>{
 const h=harness();await h.emit('SUBSCRIBED');
 h.pause();
 const oldEvent=h.change();
 await Promise.resolve();
 await h.emit('CHANNEL_ERROR');
 h.resume();await oldEvent;
 assert.equal(h.connection.textContent,'RECONNECTING');
 assert.ok(h.classes.has('status-offline'));
 assert.equal(h.stats().rendered,1);
});
test('overlapping draft loads never replace newer state with a slower old response',async()=>{
 const begin=source.indexOf('let latestLoadRequest=0;');
 const end=source.indexOf('async function save()',begin);
 assert.ok(begin>=0&&end>begin);
 const requests=[];
 const ctx={S:{picks:[]},fresh:()=>({picks:[]}),cfg:{draftId:'synthetic-only'},
  db:{from:()=>({select:()=>({eq:()=>({single:()=>new Promise(resolve=>requests.push(resolve))})})})}};
 vm.createContext(ctx);
 vm.runInContext(source.slice(begin,end)+';this.fetchDraft=load;this.state=()=>S;',ctx);
 const first=ctx.fetchDraft(),second=ctx.fetchDraft();
 assert.equal(requests.length,2);
 requests[1]({data:{state:{picks:[{golfer:1}]}},error:null});
 await second;
 requests[0]({data:{state:{picks:[]}},error:null});
 await first;
 assert.equal(ctx.state().picks.length,1);
});
