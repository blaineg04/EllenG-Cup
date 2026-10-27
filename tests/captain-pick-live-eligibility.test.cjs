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
 let confirmAction=()=>true,rendered=0,holdRpc=false,resolveRpc,loadCount=0;
 const ctx={S:state,myTeam:0,captainUserId:'captain-a',captainAuthEpoch:0,cfg:{draftId:'synthetic-only'},fresh:()=>state,
  order:()=>0,totalPicks:()=>1,canBand:()=>true,
  db:{rpc:async(name,args)=>{calls.push({name,args});if(holdRpc)return new Promise(resolve=>{resolveRpc=resolve});return {data:state,error:null}}},
  document:{getElementById:id=>id==='connection'?connection:null,querySelectorAll:()=>buttons},
  confirm:()=>confirmAction(),alert:msg=>messages.push(msg),render:()=>rendered++,
  draftSoundEnabled:false,load:async()=>{loadCount++},console:{error:()=>{}}};
 vm.createContext(ctx);
 vm.runInContext(pickSource+';this.submitPick=pick;',ctx);
 return {ctx,state,connection,calls,messages,buttons,pick:i=>ctx.submitPick(i),
  onConfirm:fn=>{confirmAction=fn},rendered:()=>rendered,holdRpc:()=>{holdRpc=true},releaseRpc:response=>resolveRpc(response),loads:()=>loadCount};
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

function authHarness(){
 const elements={login:{style:{display:'none'}},app:{style:{display:'block'}},
  connection:{textContent:'LIVE'},msg:{textContent:''}};
 const buttons=[{disabled:false}];
 let callback;
 const ctx={myTeam:0,captainUserId:'captain-a',captainAuthEpoch:0,pickSyncFailed:false,
  document:{getElementById:id=>elements[id],querySelectorAll:()=>buttons},
  db:{auth:{onAuthStateChange:cb=>{callback=cb}}}};
 const start=source.indexOf('function revokeCaptainSession()');
 const end=source.indexOf('(async()=>{',start);
 assert.ok(start>0&&end>start,'captain auth change guard must be installed');
 const helpersStart=source.indexOf('let captainChannel=null,captainSubscriptionEpoch=0;');
 const helpersEnd=source.indexOf('let draftSoundEnabled=false',helpersStart);
 assert.ok(helpersStart>0&&helpersEnd>helpersStart,'auth harness must include real channel cleanup');
 vm.createContext(ctx);
 vm.runInContext(source.slice(helpersStart,helpersEnd)+'\n'+source.slice(start,end),ctx);
 assert.equal(typeof callback,'function');
 return {ctx,elements,buttons,change:(event,session)=>callback(event,session)};
}
test('captain signout immediately revokes draft controls',()=>{
 const h=authHarness();h.change('SIGNED_OUT',null);
 assert.equal(h.ctx.myTeam,null);
 assert.equal(h.ctx.captainUserId,null);
 assert.equal(h.ctx.captainAuthEpoch,1);
 assert.equal(h.ctx.pickSyncFailed,true);
 assert.equal(h.elements.app.style.display,'none');
 assert.equal(h.elements.login.style.display,'block');
 assert.equal(h.elements.connection.textContent,'SIGN IN');
 assert.equal(h.buttons[0].disabled,true);
});
test('switching to a different signed-in user revokes prior captain access',()=>{
 const h=authHarness();h.change('SIGNED_IN',{user:{id:'captain-b'}});
 assert.equal(h.ctx.captainUserId,null);
 assert.equal(h.ctx.pickSyncFailed,true);
 assert.match(h.elements.msg.textContent,/Sign in again/);
});
test('same-user token refresh retains captain controls',()=>{
 const h=authHarness();h.change('TOKEN_REFRESHED',{user:{id:'captain-a'}});
 assert.equal(h.ctx.captainUserId,'captain-a');
 assert.equal(h.ctx.pickSyncFailed,false);
 assert.equal(h.elements.app.style.display,'block');
 assert.equal(h.buttons[0].disabled,false);
});
test('token refresh without a verified user fails closed',()=>{
 const h=authHarness();h.change('TOKEN_REFRESHED',null);
 assert.equal(h.ctx.captainUserId,null);
 assert.equal(h.buttons[0].disabled,true);
});
test('captain pick requires a verified captain identity even if realtime says LIVE',async()=>{
 const h=harness();h.ctx.captainUserId=null;
 await h.pick(0);
 assert.equal(h.calls.length,0);
});

test('delayed captain role lookup cannot restore access after signout',async()=>{
 let resolveAssignment;
 const query={eq(){return this},single(){return new Promise(resolve=>{resolveAssignment=resolve})}};
 const ctx={myTeam:null,captainUserId:null,captainAuthEpoch:0,captainRoleLookupId:0,
  cfg:{draftId:'synthetic-only'},document:{getElementById:()=>({textContent:''})},
  db:{auth:{getUser:async()=>({data:{user:{id:'captain-a'}}})},
   from:()=>({select:()=>query})}};
 const start=source.indexOf('async function whoami()');
 const end=source.indexOf('let draftSoundEnabled',start);
 assert.ok(start>0&&end>start);
 vm.createContext(ctx);
 vm.runInContext(source.slice(start,end)+';this.checkCaptain=whoami;',ctx);
 const pending=ctx.checkCaptain();
 // vm-context async continuations may run after the outer test's microtask turn.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(typeof resolveAssignment,'function');
 ctx.captainAuthEpoch++;
 resolveAssignment({data:{team_index:0},error:null});
 assert.equal(await pending,false);
 assert.equal(ctx.myTeam,null);
 assert.equal(ctx.captainUserId,null);
});

test('captain assignment lookup uses only columns in baseline SQL schema',async()=>{
 let selected;
 const filters=[];
 const query={eq(column,value){filters.push([column,value]);return this},single:async()=>({data:{team_index:1},error:null})};
 const ctx={myTeam:null,captainUserId:null,captainAuthEpoch:0,captainRoleLookupId:0,
  cfg:{draftId:'synthetic-only'},document:{getElementById:()=>({textContent:''})},
  db:{auth:{getUser:async()=>({data:{user:{id:'captain-a'}}})},
   from:table=>{assert.equal(table,'elleng_captains');return {select:columns=>{selected=columns;return query}}}}};
 const start=source.indexOf('async function whoami()');
 const end=source.indexOf('let draftSoundEnabled',start);
 vm.createContext(ctx);
 vm.runInContext(source.slice(start,end)+';this.checkCaptain=whoami;',ctx);
 assert.equal(await ctx.checkCaptain(),true);
 assert.equal(selected,'team_index');
 assert.deepEqual(filters,[['draft_id','synthetic-only'],['user_id','captain-a']]);
 assert.equal(ctx.myTeam,1);
 assert.equal(ctx.captainUserId,'captain-a');
});

// Concurrent sign-in/bootstrap checks must not let an older authorization result
// overwrite the newer assignment, even when the auth epoch has not changed.
test('older overlapping captain role lookup cannot overwrite newer assignment',async()=>{
 const resolvers=[];
 const query={eq(){return this},single(){return new Promise(resolve=>resolvers.push(resolve))}};
 const ctx={myTeam:null,captainUserId:null,captainAuthEpoch:0,captainRoleLookupId:0,
  cfg:{draftId:'synthetic-only'},document:{getElementById:()=>({textContent:''})},
  db:{auth:{getUser:async()=>({data:{user:{id:'captain-a'}}})},
   from:()=>({select:()=>query})}};
 const start=source.indexOf('async function whoami()');
 const end=source.indexOf('let draftSoundEnabled',start);
 assert.ok(start>0&&end>start);
 vm.createContext(ctx);
 vm.runInContext(source.slice(start,end)+';this.checkCaptain=whoami;',ctx);
 const first=ctx.checkCaptain();
 await new Promise(resolve=>setImmediate(resolve));
 const second=ctx.checkCaptain();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(resolvers.length,2,'both lookups must reach the assignment query');
 resolvers[1]({data:{team_index:1},error:null});
 assert.equal(await second,true);
 resolvers[0]({data:{team_index:0},error:null});
 assert.equal(await first,false,'stale lookup must fail closed');
 assert.equal(ctx.myTeam,1,'newer assignment must remain authoritative');
 assert.equal(ctx.captainUserId,'captain-a');
});

test('sign-out while pick RPC is pending discards its response without reopening controls',async()=>{
 const h=harness();h.holdRpc();
 const pending=h.pick(0);
 assert.equal(h.calls.length,1);
 h.ctx.captainAuthEpoch++;
 h.ctx.captainUserId=null;
 h.connection.textContent='SIGN IN';
 h.releaseRpc({data:{...h.state,picks:[{golfer:0,team:0}]},error:null});
 await pending;
 assert.equal(h.ctx.S,h.state,'old RPC response must not replace draft state');
 assert.equal(h.ctx.S.picks.length,0);
 assert.equal(h.rendered(),0,'old RPC must not render after revocation');
 assert.equal(h.loads(),0);
 assert.equal(h.buttons[0].disabled,true);
});
test('switching captain identity while pick RPC is pending cannot apply old response',async()=>{
 const h=harness();h.holdRpc();
 const pending=h.pick(0);
 h.ctx.captainUserId='captain-b';
 h.releaseRpc({data:{...h.state,picks:[{golfer:0,team:0}]},error:null});
 await pending;
 assert.equal(h.ctx.S.picks.length,0);
 assert.equal(h.rendered(),0);
});
test('rejected old pick RPC after sign-out does not refresh or alert as the old captain',async()=>{
 const h=harness();h.holdRpc();
 const pending=h.pick(0);
 h.ctx.captainAuthEpoch++;
 h.ctx.captainUserId=null;
 h.releaseRpc({data:null,error:new Error('synthetic stale rejection')});
 await pending;
 assert.equal(h.loads(),0);
 assert.equal(h.messages.length,0);
 assert.equal(h.rendered(),0);
});
