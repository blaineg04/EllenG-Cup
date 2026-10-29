'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const s=fs.readFileSync('common.js','utf8');
const block=s.slice(s.indexOf('function subscribe(cb)'),s.indexOf('function remaining()'));
test('draft reloads persisted state when Realtime subscription reconnects',()=>{
 assert.match(block,/st==="SUBSCRIBED"/);
 assert.equal((block.match(/await load\(\(\)=>epoch===connectionEpoch&&connected&&isCurrent\(\),\(\)=>\{applied=true\}\)/g)||[]).length,2,
  "both realtime event and reconnect loads must discard results after disconnect");
 assert.match(block,/if\(epoch!==connectionEpoch\|\|!connected\|\|!isCurrent\(\)\)return/);
 assert.match(block,/if\(!isCurrent\(\)\)return;/);
 assert.match(block,/Draft resubscription refresh failed/);
 assert.match(block,/el\.textContent="SYNC ERROR"/);
});
test('draft visibly distinguishes channel failures',()=>{
 for(const status of ['CHANNEL_ERROR','TIMED_OUT','CLOSED'])assert.ok(block.includes(status));
 assert.match(block,/"RECONNECTING"/);
});

test('draft status strip follows channel state and failed catch-up',()=>{
 assert.match(block,/getElementById\("draftStatusStrip"\)/);
 assert.match(block,/strip\.classList\.add\(st==="SUBSCRIBED"/);
 assert.match(block,/strip\.classList\.add\("status-offline"\)/);
});

const vm=require('node:vm');
const viewerHtml=fs.readFileSync('draft.html','utf8');
const viewerStart=viewerHtml.indexOf('function setDraftConnectionStatus(state,label)');
const viewerEnd=viewerHtml.indexOf('</script></body></html>',viewerStart);
assert.ok(viewerStart>0&&viewerEnd>viewerStart,'public draft viewer bootstrap is available');
const viewerBootstrap=viewerHtml.slice(viewerStart,viewerEnd).replace('(async()=>{','this.viewerReady=(async()=>{');
async function viewerHarness({failInitial=false,applyInitial=true,failSubscribe=false}={}){
 let reads=0,renders=0,subscriptions=0,clockStarts=0,unsubscriptions=0;
 const callbacks=[],events={};
 const classes=new Set();
 const connection={textContent:''},onclock={textContent:''},meta={textContent:''};
 const strip={classList:{remove:(...items)=>items.forEach(item=>classes.delete(item)),add:item=>classes.add(item)}};
 const elements={connection,draftStatusStrip:strip,onclock,meta};
 const ctx={
  document:{getElementById:id=>elements[id]||null,visibilityState:'visible',addEventListener:(name,cb)=>{events[name]=cb}},
  navigator:{onLine:true},window:{addEventListener:(name,cb)=>{events[name]=cb}},
  load:async (_guard,onApplied)=>{reads++;if(failInitial)throw Error('transient read outage');if(applyInitial)onApplied()},
  render:()=>{renders++},
  subscribe:cb=>{subscriptions++;if(failSubscribe)throw Error('channel unavailable');callbacks.push(cb);return {unsubscribe:()=>{unsubscriptions++;return Promise.resolve()}}},
  setInterval:()=>{clockStarts++},
  draw:()=>{},
  console:{error:()=>{}}
 };
 vm.createContext(ctx);vm.runInContext(viewerBootstrap,ctx);
 await ctx.viewerReady;
 return {connection,onclock,meta,classes,emit:(index=callbacks.length-1)=>callbacks[index]?.(),
  offline:()=>{ctx.navigator.onLine=false;return events.offline()},
  online:()=>{ctx.navigator.onLine=true;return events.online()},
  hidden:()=>{ctx.document.visibilityState='hidden';return events.visibilitychange()},
  visible:()=>{ctx.document.visibilityState='visible';return events.visibilitychange()},
  unsubscriptions:()=>unsubscriptions,
  stats:()=>({reads,renders,subscriptions,clockStarts})};
}
test('public viewer retries catch-up after initial draft load failure',async()=>{
 const h=await viewerHarness({failInitial:true});
 assert.deepEqual(h.stats(),{reads:1,renders:0,subscriptions:1,clockStarts:1});
 assert.equal(h.connection.textContent,'CONNECTING','subscription can still recover a failed initial read');
 assert.ok(h.classes.has('status-connecting'));
 h.emit();
 assert.equal(h.stats().renders,1,'successful subscriber catch-up can render the viewer');
});
test('public viewer does not render a superseded initial draft read',async()=>{
 const h=await viewerHarness({applyInitial:false});
 assert.deepEqual(h.stats(),{reads:1,renders:0,subscriptions:1,clockStarts:1});
 h.emit();
 assert.equal(h.stats().renders,1);
});
test('public viewer keeps subscription setup failures visible and stops its clock',async()=>{
 const h=await viewerHarness({failSubscribe:true});
 assert.deepEqual(h.stats(),{reads:1,renders:1,subscriptions:1,clockStarts:0});
 assert.equal(h.connection.textContent,'OFFLINE');
 assert.ok(h.classes.has('status-offline'));
 assert.match(h.meta.textContent,/Reload to retry/);
});

test('public viewer retires stale Realtime callbacks on offline and catches up on reconnect',async()=>{
 const h=await viewerHarness(),rendered=h.stats().renders;
 h.offline();
 assert.equal(h.connection.textContent,'OFFLINE');
 assert.ok(h.classes.has('status-offline'));
 assert.equal(h.unsubscriptions(),1,'offline must close the old channel');
 h.emit(0);
 assert.equal(h.stats().renders,rendered,'retired callback must not redraw a stale board');
 h.online();
 assert.equal(h.connection.textContent,'CONNECTING','reconnect is not LIVE before catch-up');
 assert.equal(h.stats().subscriptions,2,'reconnect creates a new authoritative subscription');
 h.emit(0);
 assert.equal(h.stats().renders,rendered,'old channel remains fenced after reconnect');
 h.emit(1);
 assert.equal(h.stats().renders,rendered+1,'new channel can render after catch-up');
 assert.equal(h.stats().clockStarts,1,'reconnect must not duplicate the clock timer');
});
test('hidden public viewer pauses its channel and refreshes on foreground',async()=>{
 const h=await viewerHarness(),rendered=h.stats().renders;
 h.hidden();
 assert.equal(h.connection.textContent,'PAUSED');
 assert.equal(h.unsubscriptions(),1);
 h.emit(0);
 assert.equal(h.stats().renders,rendered);
 h.visible();
 assert.equal(h.connection.textContent,'CONNECTING');
 assert.equal(h.stats().subscriptions,2);
 h.emit(1);
 assert.equal(h.stats().renders,rendered+1);
});
