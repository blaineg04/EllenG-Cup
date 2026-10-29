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
 let reads=0,renders=0,subscriptions=0,clockStarts=0,callback;
 const classes=new Set();
 const connection={textContent:''},onclock={textContent:''},meta={textContent:''};
 const strip={classList:{remove:(...items)=>items.forEach(item=>classes.delete(item)),add:item=>classes.add(item)}};
 const elements={connection,draftStatusStrip:strip,onclock,meta};
 const ctx={
  document:{getElementById:id=>elements[id]||null},
  load:async (_guard,onApplied)=>{reads++;if(failInitial)throw Error('transient read outage');if(applyInitial)onApplied()},
  render:()=>{renders++},
  subscribe:cb=>{subscriptions++;if(failSubscribe)throw Error('channel unavailable');callback=cb},
  setInterval:()=>{clockStarts++},
  draw:()=>{},
  console:{error:()=>{}}
 };
 vm.createContext(ctx);vm.runInContext(viewerBootstrap,ctx);
 await ctx.viewerReady;
 return {connection,onclock,meta,classes,emit:()=>callback?.(),stats:()=>({reads,renders,subscriptions,clockStarts})};
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
