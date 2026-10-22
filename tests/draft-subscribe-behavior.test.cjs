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
 let callback,handler,refreshes=0,rendered=0,rejectRefresh=false;
 const channel={on(_event,_filter,fn){handler=fn;return this},subscribe(fn){callback=fn;return this}};
 const ctx={db:{channel:()=>channel},cfg:{draftId:'synthetic-only'},
   document:{getElementById:id=>id==='connection'?connection:id==='draftStatusStrip'?strip:null},
   console:{error:()=>{}},load:async()=>{refreshes++;if(rejectRefresh)throw Error('synthetic outage')}};
 vm.createContext(ctx);
 vm.runInContext(subscribeSource+';this.connect=subscribe;',ctx);
 ctx.connect(()=>rendered++);
 return {connection,classes,emit:st=>callback(st),change:()=>handler(),stats:()=>({refreshes,rendered}),fail:()=>{rejectRefresh=true}};
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
