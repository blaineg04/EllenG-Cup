'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('captain.html','utf8');
const start=source.indexOf('let pickInFlight=false,pickSyncFailed=false;');
const end=source.indexOf('document.getElementById("signin").onclick',start);
assert.ok(start>=0&&end>start,'captain pick handler must be present');
const pickSource=source.slice(start,end);
function harness(){
 const state={timerPaused:false,picks:[],golfers:[{name:'Synthetic golfer',team:null,band:'A'}],teams:[{name:'A',roster:[]},{name:'B',roster:[]}]};
 const connection={textContent:'LIVE'},calls=[],messages=[],buttons=[{disabled:false}];
 let confirmAction=()=>true,rendered=0;
 const ctx={S:state,myTeam:0,cfg:{draftId:'synthetic-only'},fresh:()=>state,
  order:()=>0,totalPicks:()=>1,canBand:()=>true,
  db:{rpc:async(name,args)=>{calls.push({name,args});return {data:state,error:null}}},
  document:{getElementById:id=>id==='connection'?connection:null,querySelectorAll:()=>buttons},
  confirm:()=>confirmAction(),alert:msg=>messages.push(msg),render:()=>rendered++,
  draftSoundEnabled:false,load:async()=>{},console:{error:()=>{}}};
 vm.createContext(ctx);
 vm.runInContext(pickSource+';this.submitPick=pick;',ctx);
 return {ctx,state,connection,calls,messages,buttons,pick:i=>ctx.submitPick(i),
  onConfirm:fn=>{confirmAction=fn},rendered:()=>rendered};
}
test('eligible live captain submits exactly one authorized RPC',async()=>{
 const h=harness();await h.pick(0);
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].name,'elleng_make_pick');
 assert.equal(h.calls[0].args.p_draft_id,'synthetic-only');
 assert.equal(h.calls[0].args.p_golfer_index,0);
});
test('offline, syncing and failed-refresh captain cannot send a pick',async()=>{
 const h=harness();
 for(const status of ['RECONNECTING','SYNCING','SYNC ERROR']){h.connection.textContent=status;await h.pick(0)}
 h.connection.textContent='LIVE';vm.runInContext('pickSyncFailed=true;',h.ctx);await h.pick(0);
 assert.equal(h.calls.length,0);assert.equal(h.messages.length,4);
});
test('off-turn, taken, band-ineligible, invalid and completed picks are blocked',async()=>{
 const h=harness();
 h.ctx.order=()=>1;await h.pick(0);
 h.ctx.order=()=>0;h.state.golfers[0].team=1;await h.pick(0);
 h.state.golfers[0].team=null;h.ctx.canBand=()=>false;await h.pick(0);
 h.ctx.canBand=()=>true;await h.pick(-1);await h.pick(1);
 h.state.picks.push({golfer:0,team:0});await h.pick(0);
 assert.equal(h.calls.length,0);
});
test('disconnect during captain confirmation prevents stale submission',async()=>{
 const h=harness();h.onConfirm(()=>{h.connection.textContent='RECONNECTING';return true});
 await h.pick(0);assert.equal(h.calls.length,0);
 assert.match(h.messages[0],/changed while confirming/);assert.equal(h.rendered(),1);
});
test('golfer assigned during confirmation cannot be drafted again',async()=>{
 const h=harness();h.onConfirm(()=>{h.state.golfers[0].team=1;return true});
 await h.pick(0);assert.equal(h.calls.length,0);
});
