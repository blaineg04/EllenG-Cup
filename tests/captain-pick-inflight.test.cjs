'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const s=fs.readFileSync('captain.html','utf8');
const pick=s.slice(s.indexOf('let pickInFlight=false'),s.indexOf('document.getElementById("signin").onclick'));
test('captain cannot submit overlapping pick requests on repeated taps',()=>{
 assert.match(pick,/if\(pickInFlight\)return/);
 assert.match(pick,/pickInFlight=true/);
 assert.match(pick,/querySelectorAll\("\[data-p\]"\).*disabled=true/);
 assert.match(pick,/const thisPickRequest=\+\+pickRequestEpoch/);
 assert.match(pick,/finally\s*\{\s*\/\/[^\n]*\n\s*if\(thisPickRequest===pickRequestEpoch&&sameCaptainSession\(\)\)\{\s*pickInFlight=false;\s*render\(\)/);
});
test('pick failure catches refresh failure and eventually restores interaction',()=>{
 assert.match(pick,/await load\(sameCaptainSession\)/);
 assert.match(pick,/if\(!sameCaptainSession\(\)\)return;/);
 assert.match(pick,/finally\s*\{/);
});

test('realtime render cannot reactivate drafting during an in-flight pick',()=>{
 assert.match(s,/mine=!done&&t===myTeam&&!S\.timerPaused&&!pickInFlight/);
});

test('failed authoritative refresh keeps captain drafting disabled',()=>{
 assert.match(s,/mine=!done&&t===myTeam&&!S\.timerPaused&&!pickInFlight&&!pickSyncFailed/);
 assert.match(pick,/catch\(refreshError\)\{\s*if\(!sameCaptainSession\(\)\)return;\s*pickSyncFailed=true/);
 assert.match(pick,/Reload this page before drafting again/);
});

test('late RPC results are fenced to the originating captain session',()=>{
 assert.match(pick,/const pickAuthEpoch=captainAuthEpoch,pickCaptainId=captainUserId/);
 assert.match(pick,/pickAuthEpoch===captainAuthEpoch&&pickCaptainId===captainUserId/);
 assert.match(pick,/if\(!sameCaptainSession\(\)\)return;\s*if\(error\)throw error;/);
});

const vm=require('node:vm');
const channelStart=s.indexOf('let captainChannel=null,captainSubscriptionEpoch=0;');
const channelEnd=s.indexOf('let draftSoundEnabled=false',channelStart);
assert.ok(channelStart>=0&&channelEnd>channelStart,'captain session channel lifecycle exists');
function channelHarness(){
 let subscriptions=0,unsubscriptions=0,renders=0;
 const callbacks=[];
 const ctx={captainUserId:'captain-a',captainAuthEpoch:0,
  render:()=>renders++,console:{error:()=>{}},
  subscribe:callback=>{
   subscriptions++;callbacks.push(callback);
   let closed=false;
   return {unsubscribe:()=>{if(!closed){closed=true;unsubscriptions++}return Promise.resolve()}};
  }};
 vm.createContext(ctx);
 vm.runInContext(s.slice(channelStart,channelEnd)+
  '\nthis.startChannel=startCaptainSubscription;this.stopChannel=stopCaptainSubscription;',ctx);
 return {ctx,callbacks,start:()=>ctx.startChannel(),stop:()=>ctx.stopChannel(),
  subscriptions:()=>subscriptions,unsubscriptions:()=>unsubscriptions,renders:()=>renders};
}
test('captain signout disposes channel and fences a queued old-session callback',()=>{
 const h=channelHarness();h.start();
 assert.equal(h.subscriptions(),1);
 assert.equal(h.callbacks[0].isCurrent(),true);
 h.ctx.captainAuthEpoch++;
 h.stop();
 assert.equal(h.unsubscriptions(),1);
 assert.equal(h.callbacks[0].isCurrent(),false);
 h.callbacks[0]();
 assert.equal(h.renders(),0);
});
test('captain re-login replaces channel without duplicate listeners or cross-account render',()=>{
 const h=channelHarness();h.start();
 const old=h.callbacks[0];
 h.ctx.captainAuthEpoch++;
 h.ctx.captainUserId='captain-b';
 h.start();
 assert.equal(h.subscriptions(),2);
 assert.equal(h.unsubscriptions(),1);
 assert.equal(old.isCurrent(),false);
 assert.equal(h.callbacks[1].isCurrent(),true);
 old();h.callbacks[1]();
 assert.equal(h.renders(),1);
 h.stop();assert.equal(h.unsubscriptions(),2);
});
test('both captain login paths use managed realtime subscriptions',()=>{
 assert.equal(s.split('startCaptainSubscription();').length-1,2);
 assert.doesNotMatch(s,/subscribe\(render\)/);
 assert.match(s,/function revokeCaptainSession\(\)\{\s*captainAuthEpoch\+\+;[\s\S]*?pickRequestEpoch\+\+;\s*pickInFlight=false;\s*stopCaptainSubscription\(\)/);
});


test('both captain entry paths use one managed timer and revoke it on signout',()=>{
 assert.equal(s.split('startCaptainDrawTimer();').length-1,2,
  'interactive login and restored-session login both start managed refresh');
 assert.doesNotMatch(s,/setInterval\(draw,500\)/,
  'no unmanaged refresh interval remains in captain entry paths');
 assert.match(s,/function revokeCaptainSession\(\)[\s\S]*?stopCaptainSubscription\(\);\s*stopCaptainDrawTimer\(\);/);
});

test('captain draft refresh timer replaces old intervals and stops on revocation',()=>{
 const start=s.indexOf('let captainChannel=null,captainSubscriptionEpoch=0;');
 const end=s.indexOf('function stopCaptainSubscription()',start);
 assert.ok(start>=0&&end>start,'managed refresh lifecycle exists');
 const intervals=new Map();let nextId=0,draws=0;
 const ctx={
  captainUserId:'captain-a',
  draw:()=>draws++,
  setInterval:(fn,delay)=>{assert.equal(delay,500);const id=++nextId;intervals.set(id,fn);return id;},
  clearInterval:id=>intervals.delete(id)
 };
 vm.createContext(ctx);
 vm.runInContext(s.slice(start,end)+
  '\nthis.startTimer=startCaptainDrawTimer;this.stopTimer=stopCaptainDrawTimer;',ctx);
 ctx.startTimer();
 assert.equal(intervals.size,1);
 ctx.startTimer();
 assert.equal(intervals.size,1,'second login replaces the prior interval');
 assert.equal(nextId,2);
 [...intervals.values()][0]();
 assert.equal(draws,1);
 ctx.captainUserId=null;
 [...intervals.values()][0]();
 assert.equal(draws,1,'no draft drawing for a signed-out captain');
 ctx.stopTimer();
 assert.equal(intervals.size,0);
 ctx.stopTimer();
 assert.equal(intervals.size,0,'repeated cleanup is safe');
});


function deferredAuth(){
 let resolve,reject;
 const promise=new Promise((res,rej)=>{resolve=res;reject=rej});
 return {promise,resolve,reject};
}
function captainAuthElements(){
 return {
  signin:{disabled:false,textContent:'Sign In'},
  email:{value:'captain@example.test'},
  pw:{value:'test-password'},
  msg:{textContent:'unchanged'},
  connection:{textContent:'unchanged'},
  login:{style:{display:'none'}},
  app:{style:{display:'block'}}
 };
}
test('pending restored-session lookup cannot overwrite an interactive login',async()=>{
 const pending=deferredAuth(),elements=captainAuthElements();
 let lookups=0,subscribed=0;
 const ctx={
  captainBootstrapEpoch:0,captainUserId:'new-captain',
  document:{getElementById:id=>elements[id]},
  db:{auth:{getUser:()=>pending.promise}},
  whoami:async()=>{lookups++;return true},
  load:async()=>{},render:()=>{},startCaptainSubscription:()=>subscribed++,
  startCaptainDrawTimer:()=>{},console:{error:()=>{}}
 };
 vm.createContext(ctx);
 const startup=s.slice(s.lastIndexOf('(async()=>{'),s.lastIndexOf('</script>'));
 assert.match(startup,/bootEpoch!==captainBootstrapEpoch/);
 const running=vm.runInContext(startup,ctx);
 ctx.captainBootstrapEpoch++; // user begins interactive login
 pending.resolve({data:{user:null}});
 await running;
 assert.equal(lookups,0,'stale bootstrap never starts captain role lookup');
 assert.equal(subscribed,0);
 assert.equal(elements.login.style.display,'none','stale bootstrap cannot reopen login');
 assert.equal(elements.app.style.display,'block');
});
test('restored-session draft load is fenced after account switch',async()=>{
 const pending=deferredAuth(),elements=captainAuthElements();
 let loadGuard,rendered=0,subscribed=0,timers=0;
 const ctx={
  captainBootstrapEpoch:0,captainUserId:'captain-a',pickSyncFailed:true,
  document:{getElementById:id=>elements[id]},
  db:{auth:{getUser:async()=>({data:{user:{id:'captain-a'}}})}},
  whoami:async()=>true,
  load:guard=>{loadGuard=guard;return pending.promise},
  render:()=>rendered++,startCaptainSubscription:()=>subscribed++,
  startCaptainDrawTimer:()=>timers++,console:{error:()=>{}}
 };
 vm.createContext(ctx);
 const running=vm.runInContext(s.slice(s.lastIndexOf('(async()=>{'),s.lastIndexOf('</script>')),ctx);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(typeof loadGuard,'function','draft load uses a session freshness guard');
 ctx.captainBootstrapEpoch++;ctx.captainUserId='captain-b';
 assert.equal(loadGuard(),false,'stale load cannot apply its draft snapshot');
 pending.resolve();
 await running;
 assert.equal(rendered,0);
 assert.equal(subscribed,0);
 assert.equal(timers,0);
 assert.equal(elements.app.style.display,'block','old bootstrap cannot hide new captain UI');
});
test('late interactive sign-in result cannot restore revoked captain controls',async()=>{
 const pending=deferredAuth(),elements=captainAuthElements();
 let lookups=0,subscribed=0;
 const ctx={
  captainBootstrapEpoch:0,captainRoleLookupId:0,captainUserId:null,
  document:{getElementById:id=>elements[id]},
  db:{auth:{signInWithPassword:()=>pending.promise}},
  whoami:async()=>{lookups++;return true},
  load:async()=>{},render:()=>{},startCaptainSubscription:()=>subscribed++,
  startCaptainDrawTimer:()=>{}
 };
 vm.createContext(ctx);
 const start=s.indexOf('document.getElementById("signin").onclick=async()=>{');
 const end=s.indexOf('document.getElementById("soundToggle").onclick=',start);
 assert.ok(start>=0&&end>start);
 vm.runInContext(s.slice(start,end),ctx);
 const running=elements.signin.onclick();
 assert.equal(ctx.captainRoleLookupId,1,'manual sign-in invalidates older role lookup');
 ctx.captainBootstrapEpoch++; // SIGNED_OUT or account switch
 pending.resolve({error:null});
 await running;
 assert.equal(lookups,0,'revoked login never grants a captain role');
 assert.equal(subscribed,0);
 assert.equal(elements.app.style.display,'block','late completion does not alter newer UI');
 assert.equal(elements.signin.disabled,false,'button cleanup still runs');
 assert.match(s,/function revokeCaptainSession\(\)\{\s*captainAuthEpoch\+\+;\s*captainBootstrapEpoch\+\+;/);
});

function captainRoleLookupHarness(){
 const start=s.indexOf('async function whoami(){');
 const end=s.indexOf('let captainChannel=null',start);
 assert.ok(start>=0&&end>start,'captain role lookup source exists');
 let currentUser='captain-a',releaseRole,roleQueries=0,authChecks=0;
 const roleResponse=new Promise(resolve=>{releaseRole=resolve});
 const ctx={
  captainAuthEpoch:0,captainRoleLookupId:0,captainUserId:null,myTeam:null,
  cfg:{draftId:'synthetic-draft'},
  document:{getElementById:()=>({textContent:''})},
  db:{
   auth:{getUser:async()=>{authChecks++;return {data:{user:currentUser?{id:currentUser}:null}}}},
   from:table=>{
    assert.equal(table,'elleng_captains');
    return {select:column=>{
     assert.equal(column,'team_index');
     return {eq:()=>({eq:()=>({single:()=>{roleQueries++;return roleResponse}})})};
    }};
   }
  }
 };
 vm.createContext(ctx);
 vm.runInContext(s.slice(start,end)+';this.authorizeCaptain=whoami;',ctx);
 return {ctx,authorize:()=>ctx.authorizeCaptain(),switchUser:id=>{currentUser=id},
  release:()=>releaseRole({data:{team_index:1},error:null}),
  counts:()=>({roleQueries,authChecks})};
}

test('captain role lookup rejects a different authenticated account after an in-flight switch',async()=>{
 const h=captainRoleLookupHarness();
 const pending=h.authorize();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.counts().roleQueries,1,'role lookup started for original account');
 h.switchUser('captain-b');
 h.release();
 assert.equal(await pending,false,'old captain role must not be assigned to new account');
 assert.equal(h.ctx.captainUserId,null);
 assert.equal(h.ctx.myTeam,null);
 assert.equal(h.counts().authChecks,2,'identity is checked again after role query');
});

test('captain role lookup rejects sign-out before role query resolves',async()=>{
 const h=captainRoleLookupHarness();
 const pending=h.authorize();
 await new Promise(resolve=>setImmediate(resolve));
 h.switchUser(null);
 h.release();
 assert.equal(await pending,false);
 assert.equal(h.ctx.captainUserId,null);
 assert.equal(h.ctx.myTeam,null);
});

test('captain role lookup still grants a valid unchanged authenticated account',async()=>{
 const h=captainRoleLookupHarness();
 const pending=h.authorize();
 await new Promise(resolve=>setImmediate(resolve));
 h.release();
 assert.equal(await pending,true);
 assert.equal(h.ctx.captainUserId,'captain-a');
 assert.equal(h.ctx.myTeam,1);
 assert.equal(h.counts().authChecks,2);
});

test('interactive captain replacement survives Supabase SIGNED_IN without revoking the new login',async()=>{
 const elements=captainAuthElements();
 let onAuthEvent,roleChecks=0,subscriptions=0,stopped=0,timersStopped=0,loaded=0;
 const ctx={
  captainBootstrapEpoch:0,captainRoleLookupId:0,captainAuthEpoch:0,
  captainUserId:'captain-a',myTeam:0,pickRequestEpoch:0,pickInFlight:false,pickSyncFailed:false,
  document:{getElementById:id=>elements[id],querySelectorAll:()=>[{disabled:false}]},
  db:{auth:{
   onAuthStateChange:fn=>{onAuthEvent=fn},
   signInWithPassword:async()=>{onAuthEvent('SIGNED_IN',{user:{id:'captain-b'}});return {error:null}}
  }},
  whoami:async()=>{roleChecks++;ctx.captainUserId='captain-b';ctx.myTeam=1;return true},
  load:async()=>{loaded++},render:()=>{},
  startCaptainSubscription:()=>subscriptions++,startCaptainDrawTimer:()=>{},
  stopCaptainSubscription:()=>stopped++,stopCaptainDrawTimer:()=>timersStopped++
 };
 vm.createContext(ctx);
 const loginStart=s.indexOf('document.getElementById("signin").onclick=async()=>{');
 const loginEnd=s.indexOf('document.getElementById("soundToggle").onclick=',loginStart);
 const revokeStart=s.indexOf('function revokeCaptainSession(){');
 const revokeEnd=s.indexOf('(async()=>{',revokeStart);
 assert.ok(loginStart>=0&&loginEnd>loginStart&&revokeStart>0&&revokeEnd>revokeStart);
 vm.runInContext(s.slice(loginStart,loginEnd)+s.slice(revokeStart,revokeEnd),ctx);
 await elements.signin.onclick();
 assert.equal(stopped,1,'previous captain subscription is disposed before replacement');
 assert.equal(timersStopped,1,'previous captain refresh timer is disposed');
 assert.equal(ctx.captainAuthEpoch,1,'old captain session is fenced once');
 assert.equal(roleChecks,1,'replacement login reaches authorization');
 assert.equal(loaded,1,'replacement login loads authoritative state');
 assert.equal(subscriptions,1,'new captain subscribes once');
 assert.equal(ctx.captainUserId,'captain-b');
 assert.equal(ctx.myTeam,1);
 assert.equal(elements.app.style.display,'block');
 assert.equal(elements.login.style.display,'none');
 assert.equal(elements.signin.disabled,false);
});

test('failed captain replacement remains signed out rather than restoring old team controls',async()=>{
 const elements=captainAuthElements();
 const ctx={
  captainBootstrapEpoch:0,captainRoleLookupId:0,captainAuthEpoch:0,
  captainUserId:'captain-a',myTeam:0,pickRequestEpoch:0,pickInFlight:false,pickSyncFailed:false,
  document:{getElementById:id=>elements[id],querySelectorAll:()=>[{disabled:false}]},
  db:{auth:{signInWithPassword:async()=>({error:new Error('synthetic rejected credentials')})}},
  whoami:async()=>{throw new Error('role lookup must not run on failed sign-in')},
  stopCaptainSubscription:()=>{},stopCaptainDrawTimer:()=>{},
  startCaptainSubscription:()=>{throw new Error('must not subscribe')},
  startCaptainDrawTimer:()=>{throw new Error('must not start timer')}
 };
 vm.createContext(ctx);
 const loginStart=s.indexOf('document.getElementById("signin").onclick=async()=>{');
 const loginEnd=s.indexOf('document.getElementById("soundToggle").onclick=',loginStart);
 const revokeStart=s.indexOf('function revokeCaptainSession(){');
 const revokeEnd=s.indexOf('db.auth.onAuthStateChange(',revokeStart);
 vm.runInContext(s.slice(loginStart,loginEnd)+s.slice(revokeStart,revokeEnd),ctx);
 await elements.signin.onclick();
 assert.equal(ctx.captainUserId,null);
 assert.equal(ctx.myTeam,null);
 assert.equal(elements.app.style.display,'none');
 assert.equal(elements.login.style.display,'block');
 assert.match(elements.msg.textContent,/synthetic rejected credentials/);
});
