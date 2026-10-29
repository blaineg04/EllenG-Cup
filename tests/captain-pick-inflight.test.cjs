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
 assert.match(pick,/await load\(canApplyPickRefresh,/);
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
 let subscriptions=0,unsubscriptions=0,renders=0,draftLoads=0,draftLoadError=null;
 let roleIndex=null,deferRole=false,authUserId=null;const pendingRoles=[];
 const callbacks=[],events={},windowEvents={};
 const elements={login:{style:{}},app:{style:{}},connection:{textContent:'LIVE'},msg:{textContent:''}};
 const buttons=[{disabled:false}];
 const ctx={captainUserId:'captain-a',myTeam:0,S:{teams:[{},{}]},
  captainAuthEpoch:0,captainBootstrapEpoch:0,pickRequestEpoch:0,pickInFlight:false,pickSyncFailed:false,
  document:{getElementById:id=>elements[id],querySelectorAll:()=>buttons,visibilityState:'visible',
   addEventListener:(name,cb)=>{events[name]=cb}},navigator:{onLine:true},window:{addEventListener:(name,cb)=>{windowEvents[name]=cb}},
  clearInterval:()=>{},render:()=>renders++,console:{error:()=>{}},cfg:{draftId:'isolated-test'},
  load:async(guard,onApplied)=>{draftLoads++;if(draftLoadError)throw draftLoadError;if(guard())onApplied?.()},
  db:{auth:{getUser:async()=>({data:{user:{id:authUserId||ctx.captainUserId}},error:null})},
   from:table=>{assert.equal(table,'elleng_captains');return {select:()=>({eq:()=>({eq:()=>({maybeSingle:()=>{
    const response={data:{team_index:roleIndex===null?ctx.myTeam:roleIndex},error:null};
    return deferRole?new Promise(resolve=>pendingRoles.push(resolve)):Promise.resolve(response);
   }})})})};}},
  subscribe:callback=>{
   subscriptions++;callbacks.push(callback);
   let closed=false;
   return {unsubscribe:()=>{if(!closed){closed=true;unsubscriptions++}return Promise.resolve()}};
  }};
 const guardStart=s.indexOf('function assertCaptainTeamPresent(){');
 const revokeStart=s.indexOf('function revokeCaptainSession(){');
 const revokeEnd=s.indexOf('db.auth.onAuthStateChange(',revokeStart);
 assert.ok(guardStart>=0&&revokeStart>channelEnd&&revokeEnd>revokeStart);
 const resumeStart=s.indexOf('function recheckCaptainOnResume(){');
 const resumeEnd=s.indexOf('(async()=>{',resumeStart);
 assert.ok(resumeStart>revokeEnd&&resumeEnd>resumeStart,'captain resume revalidation is installed');
 vm.createContext(ctx);
 vm.runInContext(s.slice(guardStart,channelStart)+'\n'+s.slice(channelStart,channelEnd)+
  '\n'+s.slice(revokeStart,revokeEnd)+'\n'+s.slice(resumeStart,resumeEnd)+
  '\nthis.startChannel=startCaptainSubscription;this.stopChannel=stopCaptainSubscription;',ctx);
 return {ctx,callbacks,elements,buttons,start:()=>ctx.startChannel(),stop:()=>ctx.stopChannel(),
  resumeVisible:()=>{ctx.document.visibilityState='visible';return events.visibilitychange()},
  resumeHidden:()=>{ctx.document.visibilityState='hidden';return events.visibilitychange()},
  resumeOnline:()=>{ctx.navigator.onLine=true;return windowEvents.online()},
  goOffline:()=>{ctx.navigator.onLine=false;return windowEvents.offline()},draftLoads:()=>draftLoads,
  failDraftLoad:error=>{draftLoadError=error},
  subscriptions:()=>subscriptions,unsubscriptions:()=>unsubscriptions,renders:()=>renders,
  rolePending:()=>vm.runInContext('captainRoleRefreshPending',ctx),
  setRoleIndex:v=>{roleIndex=v},deferRoles:v=>{deferRole=v},
  pendingRoles:()=>pendingRoles.length,resolveRole:response=>{const resolve=pendingRoles.shift();assert.ok(resolve);resolve(response)},
  setAuthUser:v=>{authUserId=v}};
}
test('captain signout disposes channel and fences a queued old-session callback',async()=>{
 const h=channelHarness();h.start();
 assert.equal(h.subscriptions(),1);
 assert.equal(h.callbacks[0].isCurrent(),true);
 h.ctx.captainAuthEpoch++;
 h.stop();
 assert.equal(h.unsubscriptions(),1);
 assert.equal(h.callbacks[0].isCurrent(),false);
 await h.callbacks[0]();
 assert.equal(h.renders(),0);
});
test('captain re-login replaces channel without duplicate listeners or cross-account render',async()=>{
 const h=channelHarness();h.start();
 const old=h.callbacks[0];
 h.ctx.captainAuthEpoch++;
 h.ctx.captainUserId='captain-b';
 h.start();
 assert.equal(h.subscriptions(),2);
 assert.equal(h.unsubscriptions(),1);
 assert.equal(old.isCurrent(),false);
 assert.equal(h.callbacks[1].isCurrent(),true);
 await old();await h.callbacks[1]();
 assert.equal(h.renders(),1);
 h.stop();assert.equal(h.unsubscriptions(),2);
});
test('authoritative reconnect revokes captain access when commissioner removes assigned team',async()=>{
 const h=channelHarness();h.ctx.myTeam=1;h.start();
 h.ctx.S={teams:[{}]}; // Team 1 was removed in the refreshed draft.
 await h.callbacks[0]();
 assert.equal(h.renders(),0,'invalid team must never re-enable pick controls');
 assert.equal(h.unsubscriptions(),1,'revoked captain listener must be disposed');
 assert.equal(h.ctx.captainUserId,null);
 assert.equal(h.ctx.myTeam,null);
 assert.equal(h.ctx.pickSyncFailed,true);
 assert.equal(h.elements.app.style.display,'none');
 assert.equal(h.elements.login.style.display,'block');
 assert.equal(h.elements.connection.textContent,'SIGN IN');
 assert.match(h.elements.msg.textContent,/team assignment does not match this draft/);
 assert.equal(h.buttons[0].disabled,true);
 assert.equal(h.callbacks[0].isCurrent(),false,'queued callbacks must remain fenced');
 await h.callbacks[0]();
 assert.equal(h.renders(),0);
});
test('authoritative reconnect retains a valid captain assignment',async()=>{
 const h=channelHarness();h.ctx.myTeam=1;h.start();
 await h.callbacks[0]();
 assert.equal(h.renders(),1);
 assert.equal(h.unsubscriptions(),0);
 assert.equal(h.ctx.captainUserId,'captain-a');
 assert.equal(h.callbacks[0].isCurrent(),true);
});

test('captain reassignment on reconnect revokes old team controls',async()=>{
 const h=channelHarness();h.ctx.myTeam=1;h.setRoleIndex(0);h.start();
 await h.callbacks[0]();
 assert.equal(h.renders(),0);assert.equal(h.ctx.captainUserId,null);
 assert.equal(h.unsubscriptions(),1);assert.match(h.elements.msg.textContent,/team assignment changed/);
 assert.equal(h.buttons[0].disabled,true);
});
test('captain role verification cannot restore LIVE after Realtime disconnect',async()=>{
 const h=channelHarness();h.start();h.deferRoles(true);
 const stale=h.callbacks[0]();
 assert.equal(h.pendingRoles(),1);
 assert.equal(h.elements.connection.textContent,'VERIFYING');
 h.elements.connection.textContent='RECONNECTING'; // Shared subscriber reported disconnect.
 h.resolveRole({data:{team_index:0},error:null});await stale;
 assert.equal(h.elements.connection.textContent,'RECONNECTING','old verification cannot mask channel loss');
 assert.equal(h.rolePending(),true,'picks remain fenced until a new sync');
 assert.equal(h.renders(),0);
 assert.equal(h.buttons[0].disabled,true);
 // A subsequent subscribed snapshot and role check may restore controls.
 const current=h.callbacks[0]();
 assert.equal(h.pendingRoles(),1);
 h.resolveRole({data:{team_index:0},error:null});await current;
 assert.equal(h.elements.connection.textContent,'LIVE');
 assert.equal(h.rolePending(),false);
 assert.equal(h.renders(),1);
});
test('stale captain role error does not overwrite newer reconnect status',async()=>{
 const h=channelHarness();h.start();h.deferRoles(true);
 const stale=h.callbacks[0]();
 assert.equal(h.pendingRoles(),1);
 h.elements.connection.textContent='RECONNECTING';
 h.resolveRole({data:null,error:new Error('synthetic stale role failure')});await stale;
 assert.equal(h.elements.connection.textContent,'RECONNECTING');
 assert.equal(h.rolePending(),true);
 assert.equal(h.renders(),0);
 assert.equal(h.buttons[0].disabled,true);
});
test('captain role refresh freezes picks until permission check completes',async()=>{
 const h=channelHarness();h.start();h.deferRoles(true);
 const refresh=h.callbacks[0]();
 assert.equal(h.pendingRoles(),1);assert.equal(h.elements.connection.textContent,'VERIFYING');
 assert.equal(h.rolePending(),true);assert.equal(h.buttons[0].disabled,true);
 assert.equal(h.renders(),0);
 h.resolveRole({data:{team_index:0},error:null});await refresh;
 assert.equal(h.elements.connection.textContent,'LIVE');
 assert.equal(h.rolePending(),false);assert.equal(h.renders(),1);
});
test('late role response cannot reauthorize a revoked session',async()=>{
 const h=channelHarness();h.start();h.deferRoles(true);
 const refresh=h.callbacks[0]();
 h.ctx.captainAuthEpoch++;h.stop();
 h.resolveRole({data:{team_index:0},error:null});await refresh;
 assert.equal(h.renders(),0);assert.equal(h.rolePending(),false);
});
test('role lookup error fails closed and disables captain drafting',async()=>{
 const h=channelHarness();h.start();h.deferRoles(true);
 const refresh=h.callbacks[0]();
 h.resolveRole({data:null,error:new Error('network failure')});await refresh;
 assert.equal(h.renders(),0);assert.equal(h.ctx.pickSyncFailed,true);
 assert.equal(h.elements.connection.textContent,'SYNC ERROR');assert.equal(h.buttons[0].disabled,true);
});
test('returning to a visible captain tab checks reassignment even without a draft event',async()=>{
 const h=channelHarness();h.start();h.setRoleIndex(1);
 await h.resumeHidden();
 assert.equal(h.renders(),0,'hidden tab must not trigger a role refresh');
 await h.resumeVisible();
 assert.equal(h.ctx.captainUserId,null,'old captain access must be revoked');
 assert.equal(h.unsubscriptions(),1);
 assert.equal(h.draftLoads(),0,'unauthorized captain must not reload draft as LIVE');
 assert.equal(h.elements.connection.textContent,'SIGN IN');
 assert.equal(h.buttons[0].disabled,true);
});
test('hiding a captain tab freezes cached controls and ignores hidden realtime callbacks',async()=>{
 const h=channelHarness();h.start();
 await h.callbacks[0]();
 assert.equal(h.renders(),1);
 h.buttons[0].disabled=false;
 await h.resumeHidden();
 assert.equal(h.elements.connection.textContent,'PAUSED');
 assert.equal(h.rolePending(),true);
 assert.equal(h.ctx.pickSyncFailed,true);
 assert.equal(h.buttons[0].disabled,true);
 await h.callbacks[0]();
 assert.equal(h.renders(),1,'hidden realtime callback cannot restore LIVE');
 assert.equal(h.draftLoads(),0,'hidden tab must not issue an authorization refresh');
 await h.resumeVisible();
 assert.equal(h.draftLoads(),1,'foreground requires authoritative catch-up');
 assert.equal(h.renders(),2);
 assert.equal(h.elements.connection.textContent,'LIVE');
 assert.equal(h.rolePending(),false);
});
test('hiding a tab fences a pending role lookup before it can re-enable controls',async()=>{
 const h=channelHarness();h.start();h.deferRoles(true);
 const pending=h.callbacks[0]();
 assert.equal(h.pendingRoles(),1);
 await h.resumeHidden();
 h.resolveRole({data:{team_index:0},error:null});await pending;
 assert.equal(h.renders(),0);
 assert.equal(h.elements.connection.textContent,'PAUSED');
 assert.equal(h.buttons[0].disabled,true);
 h.deferRoles(false);
 await h.resumeVisible();
 assert.equal(h.draftLoads(),1);
 assert.equal(h.renders(),1);
 assert.equal(h.elements.connection.textContent,'LIVE');
});
test('online resume verifies role and refreshes authoritative draft before enabling picks',async()=>{
 const h=channelHarness();h.start();
 h.ctx.pickSyncFailed=true;
 await h.resumeOnline();
 assert.equal(h.draftLoads(),1);
 assert.equal(h.renders(),1);
 assert.equal(h.ctx.pickSyncFailed,false,'successful authoritative refresh restores safe drafting');
 assert.equal(h.elements.connection.textContent,'LIVE');
 h.stop();
 await h.resumeOnline();
 assert.equal(h.draftLoads(),1,'disposed session must not issue another read');
 assert.equal(h.renders(),1);
});
test('offline transition immediately freezes captain picks until verified reconnect',async()=>{
 const h=channelHarness();h.start();
 h.goOffline();
 assert.equal(h.elements.connection.textContent,'OFFLINE');
 assert.equal(h.rolePending(),true);
 assert.equal(h.ctx.pickSyncFailed,true);
 assert.equal(h.buttons[0].disabled,true);
 await h.callbacks[0]();
 assert.equal(h.renders(),0,'queued realtime callback must not restore LIVE while offline');
 assert.equal(h.draftLoads(),0,'offline callbacks must not attempt a draft read');
 await h.resumeOnline();
 assert.equal(h.draftLoads(),1);
 assert.equal(h.renders(),1);
 assert.equal(h.rolePending(),false);
 assert.equal(h.ctx.pickSyncFailed,false);
 assert.equal(h.elements.connection.textContent,'LIVE');
});
test('offline transition fences pending captain role verification',async()=>{
 const h=channelHarness();h.start();h.deferRoles(true);
 const refresh=h.callbacks[0]();
 assert.equal(h.pendingRoles(),1);
 h.goOffline();
 h.resolveRole({data:{team_index:0},error:null});await refresh;
 assert.equal(h.renders(),0);
 assert.equal(h.elements.connection.textContent,'OFFLINE');
 assert.equal(h.rolePending(),true);
 assert.equal(h.buttons[0].disabled,true);
});
test('failed online draft read leaves captain controls disabled',async()=>{
 const h=channelHarness();h.start();h.failDraftLoad(new Error('offline synthetic read failure'));
 await h.resumeOnline();
 assert.equal(h.draftLoads(),1);
 assert.equal(h.renders(),0);
 assert.equal(h.ctx.pickSyncFailed,true);
 assert.equal(h.elements.connection.textContent,'SYNC ERROR');
 assert.equal(h.buttons[0].disabled,true);
});
test('account switch during role refresh revokes captain controls',async()=>{
 const h=channelHarness();h.start();h.setAuthUser('captain-b');
 await h.callbacks[0]();
 assert.equal(h.renders(),0);assert.equal(h.ctx.captainUserId,null);
 assert.match(h.elements.msg.textContent,/account changed during refresh/);
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
  S:{teams:[{},{}]},
  document:{getElementById:id=>elements[id],querySelectorAll:()=>[{disabled:false}]},
  db:{auth:{
   onAuthStateChange:fn=>{onAuthEvent=fn},
   signInWithPassword:async()=>{onAuthEvent('SIGNED_IN',{user:{id:'captain-b'}});return {error:null}}
  }},
  whoami:async()=>{roleChecks++;ctx.captainUserId='captain-b';ctx.myTeam=1;return true},
  load:async(guard,onApplied)=>{loaded++;if(guard())onApplied?.()},render:()=>{},
  startCaptainSubscription:()=>subscriptions++,startCaptainDrawTimer:()=>{},
  stopCaptainSubscription:()=>stopped++,stopCaptainDrawTimer:()=>timersStopped++
 };
 vm.createContext(ctx);
 const loginStart=s.indexOf('document.getElementById("signin").onclick=async()=>{');
 const loginEnd=s.indexOf('document.getElementById("soundToggle").onclick=',loginStart);
 const revokeStart=s.indexOf('function revokeCaptainSession(){');
 const revokeEnd=s.indexOf('(async()=>{',revokeStart);
 assert.ok(loginStart>=0&&loginEnd>loginStart&&revokeStart>0&&revokeEnd>revokeStart);
 vm.runInContext(captainTeamGuardSource()+s.slice(loginStart,loginEnd)+s.slice(revokeStart,revokeEnd),ctx);
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
  S:{teams:[{},{}]},
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
 vm.runInContext(captainTeamGuardSource()+s.slice(loginStart,loginEnd)+s.slice(revokeStart,revokeEnd),ctx);
 await elements.signin.onclick();
 assert.equal(ctx.captainUserId,null);
 assert.equal(ctx.myTeam,null);
 assert.equal(elements.app.style.display,'none');
 assert.equal(elements.login.style.display,'block');
 assert.match(elements.msg.textContent,/synthetic rejected credentials/);
});

function captainTeamGuardSource(){
 const start=s.indexOf('function assertCaptainTeamPresent(){');
 const end=s.indexOf('let captainChannel=null',start);
 assert.ok(start>=0&&end>start,'loaded-draft captain team validation exists');
 return s.slice(start,end);
}
test('invalid captain team mapping cannot activate an interactive session',async()=>{
 const elements=captainAuthElements();let subscriptions=0,timers=0;
 const ctx={
  captainBootstrapEpoch:0,captainRoleLookupId:0,captainUserId:null,myTeam:null,pickSyncFailed:false,
  S:{teams:[{},{}]},
  document:{getElementById:id=>elements[id]},
  db:{auth:{signInWithPassword:async()=>({error:null})}},
  whoami:async()=>{ctx.captainUserId='captain-a';ctx.myTeam=2;return true},
  load:async(guard,onApplied)=>{if(guard())onApplied?.()},render:()=>{throw Error('invalid team must not render')},
  startCaptainSubscription:()=>subscriptions++,startCaptainDrawTimer:()=>timers++
 };
 vm.createContext(ctx);
 const loginStart=s.indexOf('document.getElementById("signin").onclick=async()=>{');
 const loginEnd=s.indexOf('document.getElementById("soundToggle").onclick=',loginStart);
 vm.runInContext(captainTeamGuardSource()+s.slice(loginStart,loginEnd),ctx);
 await elements.signin.onclick();
 assert.equal(ctx.captainUserId,null,'invalid mapping cannot retain captain authorization');
 assert.equal(ctx.myTeam,null);
 assert.equal(ctx.pickSyncFailed,true);
 assert.equal(elements.app.style.display,'none');
 assert.equal(elements.login.style.display,'block');
 assert.match(elements.msg.textContent,/team assignment does not match this draft/);
 assert.equal(subscriptions,0);assert.equal(timers,0);
});
test('restored captain session rejects a stale team assignment after team count changes',async()=>{
 const elements=captainAuthElements();let subscriptions=0,timers=0;
 const ctx={
  captainBootstrapEpoch:0,captainUserId:null,myTeam:null,pickSyncFailed:false,
  S:{teams:[{},{}]},
  document:{getElementById:id=>elements[id]},
  db:{auth:{getUser:async()=>({data:{user:{id:'captain-a'}}})}},
  whoami:async()=>{ctx.captainUserId='captain-a';ctx.myTeam=5;return true},
  load:async(guard,onApplied)=>{if(guard())onApplied?.()},render:()=>{throw Error('invalid team must not render')},
  startCaptainSubscription:()=>subscriptions++,startCaptainDrawTimer:()=>timers++,
  console:{error:()=>{}}
 };
 vm.createContext(ctx);
 vm.runInContext(captainTeamGuardSource(),ctx);
 await vm.runInContext(s.slice(s.lastIndexOf('(async()=>{'),s.lastIndexOf('</script>')),ctx);
 assert.equal(ctx.captainUserId,null);assert.equal(ctx.myTeam,null);
 assert.equal(ctx.pickSyncFailed,true);
 assert.equal(elements.app.style.display,'none');
 assert.match(elements.msg.textContent,/team assignment does not match this draft/);
 assert.equal(subscriptions,0);assert.equal(timers,0);
});
test('valid captain mapping remains authorized for current draft',()=>{
 const ctx={S:{teams:[{},{}]},captainUserId:'captain-b',myTeam:1,pickSyncFailed:true};
 vm.createContext(ctx);
 vm.runInContext(captainTeamGuardSource()+'this.checkTeam=assertCaptainTeamPresent;',ctx);
 assert.doesNotThrow(()=>ctx.checkTeam());
 assert.equal(ctx.captainUserId,'captain-b');
 assert.equal(ctx.myTeam,1);
});

test('captain direct pick guard rejects hidden and offline browsers even before lifecycle events',()=>{
 const start=s.indexOf('function captainSessionForegroundOnline(){');
 const end=s.indexOf('async function pick(i){',start);
 assert.ok(start>0&&end>start,'foreground guard must precede pick submission');
 const ctx={
  S:{golfers:[{name:'Synthetic Golfer',team:null,band:'A'}],picks:[],timerPaused:false},
  pickSyncFailed:false,captainRoleRefreshPending:false,captainUserId:'captain-test',myTeam:0,
  document:{visibilityState:'visible',getElementById:()=>({textContent:'LIVE'})},
  navigator:{onLine:true},
  totalPicks:()=>1,order:()=>0,canBand:()=>true
 };
 vm.createContext(ctx);
 vm.runInContext(s.slice(start,end)+'\nthis.canSubmit=canSubmitCaptainPick;',ctx);
 assert.equal(ctx.canSubmit(0),true,'valid foreground/online captain may submit');
 ctx.document.visibilityState='hidden';
 assert.equal(ctx.canSubmit(0),false,'hidden tab cannot submit despite cached LIVE status');
 ctx.document.visibilityState='visible';ctx.navigator.onLine=false;
 assert.equal(ctx.canSubmit(0),false,'offline browser cannot submit despite cached LIVE status');
 ctx.navigator.onLine=true;
 assert.equal(ctx.canSubmit(0),true,'foreground online state restores only this local eligibility gate');
});
test('captain render cannot enable pick buttons while hidden or offline without an event',()=>{
 const start=s.indexOf('function render(){'),end=s.indexOf('function draw(){',start);
 assert.ok(start>0&&end>start);
 assert.match(s.slice(start,end),/mine=[^;]+&&captainSessionForegroundOnline\(\)/);
});

function captainEntryLifecycleHarness(mode,{applied=true}={}){
 const elements=captainAuthElements();
 elements.login.style.display='block';elements.app.style.display='none';
 let finishLoad,loadGuard,subscriptions=0,timers=0,renders=0;
 const ctx={
  captainBootstrapEpoch:0,captainRoleLookupId:0,captainUserId:null,myTeam:null,pickSyncFailed:true,
  S:{teams:[{},{}]},document:{visibilityState:'visible',getElementById:id=>elements[id]},
  navigator:{onLine:true},
  db:{auth:{
   getUser:async()=>({data:{user:{id:'captain-a'}}}),
   signInWithPassword:async()=>({error:null})
  }},
  whoami:async()=>{ctx.captainUserId='captain-a';ctx.myTeam=0;return true},
  load:(guard,onApplied)=>{loadGuard=guard;return new Promise(resolve=>{finishLoad=()=>{if(applied&&guard())onApplied?.();resolve()}})},
  render:()=>renders++,startCaptainSubscription:()=>subscriptions++,
  startCaptainDrawTimer:()=>timers++,console:{error:()=>{}}
 };
 vm.createContext(ctx);
 const loginStart=s.indexOf('document.getElementById("signin").onclick=async()=>{');
 const loginEnd=s.indexOf('document.getElementById("soundToggle").onclick=',loginStart);
 const startup=s.slice(s.lastIndexOf('(async()=>{'),s.lastIndexOf('</script>'));
 vm.runInContext(captainTeamGuardSource(),ctx);
 const pending=mode==='bootstrap'?vm.runInContext(startup,ctx):(()=>{
  vm.runInContext(s.slice(loginStart,loginEnd),ctx);
  return elements.signin.onclick();
 })();
 return {ctx,elements,pending,guard:()=>loadGuard,finish:()=>finishLoad(),
  subscriptions:()=>subscriptions,timers:()=>timers,renders:()=>renders};
}
test('captain role lookup does not trust cached auth while offline',async()=>{
 let authReads=0,roleReads=0;
 const ctx={
  captainAuthEpoch:0,captainRoleLookupId:0,captainUserId:null,myTeam:null,
  document:{visibilityState:'visible',getElementById:()=>({textContent:''})},
  navigator:{onLine:false},cfg:{draftId:'isolated-test'},
  db:{auth:{getUser:async()=>{authReads++;return {data:{user:{id:'captain-a'}}}}},
   from:()=>{roleReads++;throw Error('offline role lookup must not start')}}
 };
 vm.createContext(ctx);
 const start=s.indexOf('async function whoami(){'),end=s.indexOf('function assertCaptainTeamPresent(){',start);
 vm.runInContext(s.slice(start,end)+'\nthis.verify=whoami;',ctx);
 assert.equal(await ctx.verify(),false);
 assert.equal(authReads,0);assert.equal(roleReads,0);
 assert.equal(ctx.captainUserId,null);assert.equal(ctx.myTeam,null);
});
test('captain role read cannot authorize when tab hides before response',async()=>{
 let finishRole,authReads=0;
 const ctx={
  captainAuthEpoch:0,captainRoleLookupId:0,captainUserId:null,myTeam:null,
  document:{visibilityState:'visible',getElementById:()=>({textContent:''})},
  navigator:{onLine:true},cfg:{draftId:'isolated-test'},
  db:{auth:{getUser:async()=>{authReads++;return {data:{user:{id:'captain-a'}}}}},
   from:()=>({select:()=>({eq:()=>({eq:()=>({single:()=>new Promise(resolve=>{finishRole=resolve})})})})})}
 };
 vm.createContext(ctx);
 const start=s.indexOf('async function whoami(){'),end=s.indexOf('function assertCaptainTeamPresent(){',start);
 vm.runInContext(s.slice(start,end)+'\nthis.verify=whoami;',ctx);
 const pending=ctx.verify();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(typeof finishRole,'function');
 ctx.document.visibilityState='hidden'; // no visibilitychange event delivered
 finishRole({data:{team_index:0},error:null});
 assert.equal(await pending,false);
 assert.equal(authReads,2,'identity confirmation may finish, but hidden tab must not authorize');
 assert.equal(ctx.captainUserId,null);assert.equal(ctx.myTeam,null);
});
for(const mode of ['bootstrap','interactive']){
 test('captain '+mode+' entry discards a draft load completed after disconnect',async()=>{
  const h=captainEntryLifecycleHarness(mode);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof h.guard(),'function');
  h.ctx.navigator.onLine=false; // offline event has not fired
  assert.equal(h.guard()(),false,'offline draft response must not apply');
  h.finish();await h.pending;
  assert.equal(h.ctx.captainUserId,null);
  assert.equal(h.ctx.myTeam,null);
  assert.equal(h.ctx.pickSyncFailed,true);
  assert.equal(h.elements.app.style.display,'none');
  assert.equal(h.elements.login.style.display,'block');
  assert.match(h.elements.msg.textContent,/offline or hidden/);
  assert.equal(h.subscriptions(),0);assert.equal(h.timers(),0);assert.equal(h.renders(),0);
 });
}


for(const mode of ['bootstrap','interactive']){
 test('captain '+mode+' entry cannot authorize an unapplied superseded draft read',async()=>{
  const h=captainEntryLifecycleHarness(mode,{applied:false});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.guard()(),true,'entry remains current and online');
  h.finish();await h.pending;
  assert.equal(h.ctx.captainUserId,null);
  assert.equal(h.ctx.myTeam,null);
  assert.equal(h.ctx.pickSyncFailed,true);
  assert.equal(h.elements.app.style.display,'none');
  assert.equal(h.elements.login.style.display,'block');
  assert.match(h.elements.msg.textContent,/draft could not be verified/);
  assert.equal(h.subscriptions(),0);assert.equal(h.timers(),0);assert.equal(h.renders(),0);
 });
 test('captain '+mode+' entry permits a current applied authoritative draft read',async()=>{
  const h=captainEntryLifecycleHarness(mode,{applied:true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.guard()(),true);
  h.finish();await h.pending;
  assert.equal(h.ctx.captainUserId,'captain-a');
  assert.equal(h.ctx.myTeam,0);
  assert.equal(h.ctx.pickSyncFailed,false);
  assert.equal(h.elements.app.style.display,'block');
  assert.equal(h.elements.login.style.display,'none');
  assert.equal(h.subscriptions(),1);assert.equal(h.timers(),1);assert.equal(h.renders(),1);
 });
}

// Exercise the real captain pick handler with synthetic RPC and draft reads.
// A superseded or offline read must never be mistaken for an applied snapshot.
function pickRefreshHarness({applied=true,rpcError=false,foreground=true}={}){
 const alerts=[],buttons=[{disabled:false}];let renders=0,loads=0;
 const start=s.indexOf('async function pick(i){');
 const end=s.indexOf('document.getElementById("signin").onclick',start);
 assert.ok(start>=0&&end>start,'real captain pick handler must exist');
 const ctx={
  S:{timerPaused:false,golfers:[{name:'Test Golfer'}],teams:[{name:'Team 1'}],picks:[]},
  myTeam:0,pickInFlight:false,pickRequestEpoch:0,captainAuthEpoch:0,
  captainUserId:'captain-a',pickSyncFailed:false,draftSoundEnabled:false,
  cfg:{draftId:'synthetic-only'},canSubmitCaptainPick:()=>true,
  captainSessionForegroundOnline:()=>foreground,confirm:()=>true,
  document:{querySelectorAll:()=>buttons},alert:msg=>alerts.push(msg),
  render:()=>renders++,console:{error:()=>{}},
  db:{rpc:async()=>rpcError?{error:new Error('Rejected by server')}:{data:{ok:true},error:null}},
  load:async(guard,onApplied)=>{loads++;if(applied&&guard())onApplied()},
 };
 vm.createContext(ctx);vm.runInContext(s.slice(start,end)+'\nthis.performPick=pick;',ctx);
 return {ctx,alerts,buttons,loads:()=>loads,renders:()=>renders,
  pick:()=>ctx.performPick(0)};
}
test('successful pick RPC cannot certify a superseded, unapplied draft refresh',async()=>{
 const h=pickRefreshHarness({applied:false});
 await h.pick();
 assert.equal(h.loads(),1);
 assert.equal(h.ctx.pickSyncFailed,true,'no authoritative snapshot means drafting stays locked');
 assert.equal(h.ctx.pickInFlight,false);
 assert.equal(h.renders(),1);
 assert.match(h.alerts.join(' '),/latest draft could not be loaded/);
});
test('successful pick RPC restores synchronized state only after authoritative read applies',async()=>{
 const h=pickRefreshHarness({applied:true});
 await h.pick();
 assert.equal(h.ctx.pickSyncFailed,false);
 assert.equal(h.ctx.pickInFlight,false);
 assert.deepEqual(h.alerts,[]);
 assert.equal(h.renders(),1);
});
test('rejected pick RPC cannot unlock drafting when recovery read was superseded',async()=>{
 const h=pickRefreshHarness({applied:false,rpcError:true});
 await h.pick();
 assert.equal(h.ctx.pickSyncFailed,true);
 assert.match(h.alerts.join(' '),/Unable to refresh the draft/);
});
test('hidden captain cannot certify delayed post-pick refresh without visibility event',async()=>{
 const h=pickRefreshHarness({applied:true,foreground:false});
 await h.pick();
 assert.equal(h.ctx.pickSyncFailed,true);
 assert.match(h.alerts.join(' '),/latest draft could not be loaded/);
});
