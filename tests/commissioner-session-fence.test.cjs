'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('admin.html','utf8');
const varsStart=source.indexOf('let commissionerAuthEpoch=0,commissionerOpenId=0,commissionerUserId=null;');
const saveStart=source.indexOf('async function secureSave()');
const saveEnd=source.indexOf('save=secureSave;',saveStart);
const authStart=source.indexOf('function revokeCommissionerSession()');
const authEnd=source.indexOf('document.getElementById("login").onclick',authStart);
assert.ok(varsStart>0&&saveStart>varsStart&&saveEnd>saveStart&&authStart>saveEnd&&authEnd>authStart);
const code=source.slice(varsStart,source.indexOf('\n',varsStart)+1)+'\n'+
 source.slice(saveStart,saveEnd)+'\n'+source.slice(authStart,authEnd)+
 '\nthis.openAdmin=openAdmin;this.secureSave=secureSave;';
function harness(){
 const elements={loginCard:{style:{display:'block'}},adminApp:{style:{display:'none'}},
  authMsg:{textContent:''},connection:{textContent:''}};
 const buttons=[{disabled:false}],authReads=[],draftReads=[],writes=[],windowEvents={};
 let authChanged,subscriptions=0,unsubscriptions=0,activeSubscriptions=0,renders=0,invalidations=0,confirmedUserId=null;const callbacks=[];
 const ctx={draftUpdatedAt:null,savingDraft:false,tick:null,liveMode:false,S:{picks:[]},
  fresh:()=>({picks:[]}),cfg:{draftId:'synthetic-only'},
  rsvpPreviewController:{invalidate:()=>{invalidations++}},
  document:{getElementById:id=>elements[id],querySelectorAll:()=>buttons},
  navigator:{onLine:true},window:{addEventListener:(event,cb)=>{windowEvents[event]=cb}},
  db:{auth:{getUser:()=>confirmedUserId!==null?Promise.resolve({data:{user:{id:confirmedUserId}},error:null}):new Promise(resolve=>authReads.push(resolve)),
   onAuthStateChange:cb=>{authChanged=cb}},
   from:()=>({select:()=>({eq:()=>({maybeSingle:()=>new Promise(resolve=>draftReads.push(resolve))})}),
    insert:()=>{writes.push('insert');throw Error('unexpected insert')}}),
   rpc:()=>{writes.push('rpc');throw Error('unexpected rpc')}},
  setupRender:()=>{renders++},subscribe:cb=>{
   subscriptions++;activeSubscriptions++;callbacks.push(cb);let closed=false;
   return {unsubscribe:()=>{if(!closed){closed=true;unsubscriptions++;activeSubscriptions--}return Promise.resolve('ok')}};
  },setInterval:()=>1,
  alert:()=>{},console:{error:()=>{}}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 return {ctx,elements,buttons,authReads,draftReads,writes,
  open:()=>{confirmedUserId=null;return ctx.openAdmin()},save:()=>{confirmedUserId=null;return ctx.secureSave()},change:(event,session)=>authChanged(event,session),
  offline:()=>{ctx.navigator.onLine=false;return windowEvents.offline()},
  online:()=>{ctx.navigator.onLine=true;confirmedUserId=null;return windowEvents.online()},
  auth:(index,id)=>authReads[index]({data:{user:id?{id}:null},error:null}),
  // After the owner read, Supabase getUser() returns the current account for
  // the second identity check. Saves explicitly switch back to deferred reads
  // so sign-out races remain controllable in the synthetic test.
  draft:(index,id,confirmedId=id)=>{
   confirmedUserId=confirmedId;
   draftReads[index]({data:{state:{picks:[]},owner_id:id,updated_at:'2026-10-27T00:00:00Z'},error:null});
  },
  subscriptions:()=>subscriptions,unsubscriptions:()=>unsubscriptions,activeSubscriptions:()=>activeSubscriptions,
  invalidations:()=>invalidations,
  renders:()=>renders,notify:index=>callbacks[index](),listener:index=>callbacks[index]};
}
test('commissioner Realtime read guard is revoked on sign-out',async()=>{
 const h=harness(),opening=h.open();
 h.auth(0,'commissioner-a');await new Promise(resolve=>setImmediate(resolve));
 h.draft(0,'commissioner-a');await opening;
 const listener=h.listener(0),rendered=h.renders();
 assert.equal(typeof listener.isCurrent,'function','shared subscriber needs a pre-read session guard');
 assert.equal(listener.isCurrent(),true);
 h.change('SIGNED_OUT',null);
 assert.equal(listener.isCurrent(),false,'revoked listener must not apply queued draft reads');
 h.notify(0);
 assert.equal(h.renders(),rendered,'stale listener cannot redraw after sign-out');
 assert.equal(h.elements.connection.textContent,'SIGN IN');
});
test('offline commissioner immediately loses controls and reconnect rechecks owner',async()=>{
 const h=harness(),first=h.open();
 h.auth(0,'commissioner-a');await new Promise(resolve=>setImmediate(resolve));
 h.draft(0,'commissioner-a');await first;
 const oldListener=h.listener(0);
 assert.equal(h.elements.adminApp.style.display,'block');
 h.offline();
 assert.equal(h.elements.connection.textContent,'OFFLINE');
 assert.equal(h.elements.adminApp.style.display,'none');
 assert.equal(h.buttons[0].disabled,true);
 assert.equal(h.unsubscriptions(),1);
 assert.equal(oldListener.isCurrent(),false);
 const resumed=h.online();
 assert.equal(h.elements.connection.textContent,'VERIFYING');
 assert.equal(h.authReads.length,2,'reconnect requires a fresh auth lookup');
 h.auth(1,'commissioner-a');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.draftReads.length,2,'reconnect must reload authoritative ownership');
 h.draft(1,'commissioner-a');await resumed;
 assert.equal(h.elements.adminApp.style.display,'block');
 assert.equal(h.elements.connection.textContent,'READY');
 assert.equal(h.subscriptions(),2);
 assert.equal(oldListener.isCurrent(),false,'old channel stays fenced after reconnect');
});
test('offline during commissioner owner lookup fences late response and reconnect verifies anew',async()=>{
 const h=harness(),pending=h.open();
 h.auth(0,'commissioner-a');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.draftReads.length,1);
 h.offline();
 h.draft(0,'commissioner-a');await pending;
 assert.equal(h.elements.connection.textContent,'OFFLINE');
 assert.equal(h.elements.adminApp.style.display,'none');
 assert.equal(h.subscriptions(),0);
 const resumed=h.online();
 h.auth(1,'commissioner-a');await new Promise(resolve=>setImmediate(resolve));
 h.draft(1,'commissioner-a');await resumed;
 assert.equal(h.elements.connection.textContent,'READY');
 assert.equal(h.subscriptions(),1);
});
test('superseded commissioner listener stays invalid after same-account reauthorization',async()=>{
 const h=harness(),first=h.open();
 h.auth(0,'commissioner-a');await new Promise(resolve=>setImmediate(resolve));
 h.draft(0,'commissioner-a');await first;
 const oldListener=h.listener(0);
 assert.equal(oldListener.isCurrent(),true);
 const second=h.open();
 assert.equal(oldListener.isCurrent(),false,'new verification must retire prior listener before its reads apply');
 h.auth(1,'commissioner-a');await new Promise(resolve=>setImmediate(resolve));
 h.draft(1,'commissioner-a');await second;
 assert.equal(h.listener(1).isCurrent(),true);
 assert.equal(oldListener.isCurrent(),false,'same user ID must not revive previous subscription');
 const rendered=h.renders();h.notify(0);
 assert.equal(h.renders(),rendered,'old subscription cannot render after a new login');
});
test('signout invalidates pending commissioner lookup without reopening controls',async()=>{
 const h=harness(),pending=h.open();
 h.change('SIGNED_OUT',null);
 h.auth(0,'commissioner-a');await pending;
 assert.equal(h.draftReads.length,0);
 assert.equal(h.elements.adminApp.style.display,'none');
 assert.equal(h.elements.connection.textContent,'SIGN IN');
 assert.equal(h.subscriptions(),0);
 assert.equal(h.buttons[0].disabled,true);
});
test('only the newest commissioner lookup can grant access',async()=>{
 const h=harness(),older=h.open(),newer=h.open();
 h.auth(1,'commissioner-b');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.draftReads.length,1);
 h.draft(0,'commissioner-b');await newer;
 h.auth(0,'commissioner-a');await older;
 assert.equal(h.elements.adminApp.style.display,'block');
 assert.equal(h.draftReads.length,1);
 assert.equal(h.subscriptions(),1);
 assert.equal(vm.runInContext('commissionerUserId',h.ctx),'commissioner-b');
});
test('commissioner owner verification rejects a session that switched accounts during confirmation',async()=>{
 const h=harness(),opening=h.open();
 h.auth(0,'commissioner-a');await new Promise(resolve=>setImmediate(resolve));
 h.draft(0,'commissioner-a','commissioner-b');await opening;
 assert.equal(h.elements.adminApp.style.display,'none');
 assert.equal(h.elements.connection.textContent,'SIGN IN');
 assert.equal(h.subscriptions(),0);
 assert.equal(vm.runInContext('commissionerUserId',h.ctx),null);
});

test('account switch revokes already verified commissioner controls',async()=>{
 const h=harness(),pending=h.open();
 h.auth(0,'commissioner-a');await new Promise(resolve=>setImmediate(resolve));
 h.draft(0,'commissioner-a');await pending;
 assert.equal(h.elements.adminApp.style.display,'block');
 h.change('SIGNED_IN',{user:{id:'commissioner-b'}});
 assert.equal(h.elements.adminApp.style.display,'none');
 assert.equal(h.elements.connection.textContent,'SIGN IN');
 assert.equal(vm.runInContext('commissionerUserId',h.ctx),null);
 assert.equal(h.buttons[0].disabled,true);
 assert.equal(h.unsubscriptions(),1);
 assert.equal(h.activeSubscriptions(),0);
});
test('signout during save authentication prevents commissioner database write',async()=>{
 const h=harness(),opened=h.open();
 h.auth(0,'commissioner-a');await new Promise(resolve=>setImmediate(resolve));
 h.draft(0,'commissioner-a');await opened;
 const saving=h.save();
 assert.equal(h.authReads.length,2,'initial login and save authorization each require a deferred getUser');
 assert.equal(h.invalidations(),2,'opening commissioner verification and starting a save revoke old RSVP readiness');
 h.change('SIGNED_OUT',null);
 assert.equal(h.invalidations(),3,'signout must revoke any pending RSVP snapshot');
 h.auth(1,'commissioner-a');
 await assert.rejects(saving,/session changed while saving/);
 assert.deepEqual(h.writes,[]);
 assert.equal(h.elements.adminApp.style.display,'none');
});


// Rehearsal gate: the commissioner overrides common.js load(), but must preserve
// subscribe()'s onApplied contract or the UI remains stuck at SYNCING.
const commonSource=fs.readFileSync('common.js','utf8');
const subscribeStart=commonSource.indexOf('function subscribe(cb)');
const subscribeEnd=commonSource.indexOf('function remaining()',subscribeStart);
const commissionerLoadStart=source.indexOf('let commissionerLoadRequest=0;');
const commissionerLoadEnd=source.indexOf('async function secureSave()',commissionerLoadStart);
assert.ok(subscribeStart>=0&&subscribeEnd>subscribeStart&&commissionerLoadStart>=0&&commissionerLoadEnd>commissionerLoadStart);
function commissionerRealtimeHarness(){
 const indicator={textContent:'',className:''},classes=new Set(),pending=[];
 let invalidations=0,revocations=0;
 const strip={classList:{add:n=>classes.add(n),remove:(...names)=>names.forEach(n=>classes.delete(n))}};
 const button={disabled:false};let status,change,renders=0;
 const channel={on(_type,_filter,cb){change=cb;return this},subscribe(cb){status=cb;return this}};
 const ctx={
  S:{picks:[]},fresh:()=>({picks:[]}),savingDraft:false,draftUpdatedAt:null,
  commissionerAuthEpoch:0,commissionerUserId:'commissioner-a',cfg:{draftId:'synthetic-only'},
  rsvpPreviewController:{invalidate:()=>{invalidations++}},
  // Owner revocation is a separate authorization boundary; model its
  // observable effect without allowing the synthetic harness to save.
  revokeCommissionerSession:()=>{revocations++;ctx.commissionerAuthEpoch++;ctx.commissionerUserId=null;button.disabled=true;indicator.textContent='SIGN IN'},
  db:{channel:()=>channel,from:()=>({select:()=>({eq:()=>({single:()=>new Promise(resolve=>pending.push(resolve))})})})},
  document:{getElementById:id=>id==='connection'?indicator:id==='draftStatusStrip'?strip:null,querySelectorAll:()=>[button]},
  console:{error:()=>{}}
 };
 vm.createContext(ctx);
 vm.runInContext(source.slice(commissionerLoadStart,commissionerLoadEnd)+'\n'+commonSource.slice(subscribeStart,subscribeEnd)+'\nthis.connect=subscribe;this.getState=()=>S;',ctx);
 ctx.connect(()=>renders++);
 return {ctx,indicator,classes,pending,button,emit:s=>status(s),change:()=>change(),
  reply:(index,picks,updated_at='2026-10-27T10:00:00Z',owner_id='commissioner-a')=>pending[index]({data:{state:{picks},owner_id,updated_at},error:null}),
  state:()=>ctx.getState(),renders:()=>renders,invalidations:()=>invalidations,revocations:()=>revocations};
}
test('commissioner subscription reaches LIVE only after an applied authoritative refresh',async()=>{
 const h=commissionerRealtimeHarness(),connecting=h.emit('SUBSCRIBED');
 assert.equal(h.indicator.textContent,'SYNCING');
 assert.equal(h.renders(),0);
 assert.equal(h.invalidations(),1,'pending Realtime read must revoke old RSVP readiness immediately');
 h.reply(0,[{golfer:1}]);await connecting;
 assert.equal(h.indicator.textContent,'LIVE');
 assert.ok(h.classes.has('status-live'));
 assert.equal(h.state().picks.length,1);
 assert.equal(h.renders(),1);
});

test('commissioner Realtime refresh revokes controls if draft ownership changes',async()=>{
 const h=commissionerRealtimeHarness(),connecting=h.emit('SUBSCRIBED');
 h.reply(0,[{golfer:1}],'2026-10-27T10:00:00Z','another-commissioner');
 await connecting;
 assert.equal(h.revocations(),1);
 assert.equal(h.ctx.commissionerUserId,null);
 assert.equal(h.button.disabled,true);
 assert.equal(h.indicator.textContent,'SIGN IN');
 assert.equal(h.renders(),0);
 assert.equal(h.state().picks.length,0);
});

test('failed commissioner Realtime read cannot leave previously verified RSVP readiness visible',async()=>{
 const h=commissionerRealtimeHarness(),connecting=h.emit('SUBSCRIBED');
 assert.equal(h.invalidations(),1);
 assert.equal(h.indicator.textContent,'SYNCING');
 h.pending[0]({data:null,error:new Error('synthetic network outage')});
 await connecting;
 assert.equal(h.indicator.textContent,'SYNC ERROR');
 assert.equal(h.invalidations(),1);
 assert.equal(h.renders(),0);
 assert.equal(h.state().picks.length,0);
});

test('commissioner delayed refresh cannot apply after session revocation',async()=>{
 const h=commissionerRealtimeHarness(),connecting=h.emit('SUBSCRIBED');
 h.ctx.commissionerAuthEpoch++;
 h.ctx.commissionerUserId=null;
 h.reply(0,[{golfer:1}]);await connecting;
 assert.equal(h.state().picks.length,0);
 assert.notEqual(h.indicator.textContent,'LIVE');
 assert.equal(h.renders(),0);
});
test('commissioner concurrent refresh cannot overwrite a newer response',async()=>{
 const h=commissionerRealtimeHarness(),first=h.emit('SUBSCRIBED'),second=h.change();
 assert.equal(h.pending.length,2);
 assert.equal(h.invalidations(),2);
 h.reply(1,[{golfer:2}],'2026-10-27T10:00:02Z');await second;
 h.reply(0,[{golfer:1}],'2026-10-27T10:00:01Z');await first;
 assert.equal(h.state().picks[0].golfer,2);
 assert.equal(h.renders(),1);
 assert.equal(h.indicator.textContent,'LIVE');
});

test('commissioner signout disposes active draft subscription and ignores late callbacks',async()=>{
 const h=harness(),opening=h.open();
 h.auth(0,'commissioner-a');await new Promise(resolve=>setImmediate(resolve));
 h.draft(0,'commissioner-a');await opening;
 assert.equal(h.activeSubscriptions(),1);
 const rendersBefore=h.renders();
 h.change('SIGNED_OUT',null);
 assert.equal(h.unsubscriptions(),1);
 assert.equal(h.activeSubscriptions(),0);
 h.notify(0); // A callback already queued before unsubscribe must not render.
 assert.equal(h.renders(),rendersBefore);
 assert.equal(h.elements.adminApp.style.display,'none');
});
test('reverification replaces the old commissioner channel without duplicate listeners',async()=>{
 const h=harness(),first=h.open();
 h.auth(0,'commissioner-a');await new Promise(resolve=>setImmediate(resolve));
 h.draft(0,'commissioner-a');await first;
 assert.equal(h.activeSubscriptions(),1);
 const second=h.open();
 assert.equal(h.unsubscriptions(),1);
 assert.equal(h.activeSubscriptions(),0);
 assert.equal(h.elements.adminApp.style.display,'none');
 h.auth(1,'commissioner-b');await new Promise(resolve=>setImmediate(resolve));
 h.draft(1,'commissioner-b');await second;
 assert.equal(h.subscriptions(),2);
 assert.equal(h.activeSubscriptions(),1);
 const rendersBefore=h.renders();
 h.notify(0);
 assert.equal(h.renders(),rendersBefore);
 h.notify(1);
 assert.equal(h.renders(),rendersBefore+1);
 assert.equal(vm.runInContext('commissionerUserId',h.ctx),'commissioner-b');
});

const actionStart=source.indexOf('// Fence all optimistic commissioner actions');
const actionEnd=source.indexOf('// Invalidate pending commissioner lookups',actionStart);
assert.ok(actionStart>0&&actionEnd>actionStart);
function actionHarness(){
 const state={picks:[],golfers:[{name:'Synthetic',team:null,band:'A'}],teams:[{name:'A',roster:[]}],timerPaused:false,timerLength:60,timerEndsAt:null};
 const els={saveSetup:{disabled:false},applySetupSize:{disabled:false},setupTeamCount:{value:'2'},setupGolferCount:{value:'2'},setupSizeMsg:{textContent:''},setup:{style:{display:'block'}},live:{style:{display:'none'}},setupBtn:{},undo:{},pause:{},resetClock:{},dtype:{value:'snake'},tlen:{value:'60'}};
 const pending=[];let renders=0;
 const ctx={S:state,savingDraft:false,commissionerAuthEpoch:0,commissionerUserId:'commissioner-a',
  liveMode:false,structuredClone,Date,bands:['A','B','C','D'],EllenGDraftSetup:require('../draft-setup-config.js'),order:()=>0,totalPicks:()=>1,canBand:()=>true,remaining:()=>30,
  save:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),
  document:{getElementById:id=>els[id],querySelectorAll:()=>[]},liveRender:()=>renders++,setupRender:()=>{}};
 const lockStart=source.indexOf('function setupIsLocked(){');
 const lockEnd=source.indexOf('function setupRender(){',lockStart);
 assert.ok(lockStart>0&&lockEnd>lockStart);
 vm.createContext(ctx);
 vm.runInContext(source.slice(lockStart,lockEnd)+source.slice(actionStart,actionEnd)+';this.doPick=pick;',ctx);
 return {ctx,els,pending,renders:()=>renders,switchUser:()=>{ctx.commissionerAuthEpoch++;ctx.commissionerUserId='commissioner-b';
  const next={picks:[{golfer:99}],golfers:[],teams:[],timerPaused:true,timerLength:30};ctx.S=next;return next;}};
}
test('old commissioner rejected pick cannot roll back new commissioner draft',async()=>{
 const h=actionHarness(),work=h.ctx.doPick(0);assert.equal(h.pending.length,1);
 const next=h.switchUser();h.pending[0].reject(Error('synthetic conflict'));await work;
 assert.equal(h.ctx.S,next);assert.equal(h.renders(),0);
});
test('old commissioner successful setup save cannot reopen live view in new login',async()=>{
 const h=actionHarness(),work=h.els.saveSetup.onclick();assert.equal(h.pending.length,1);
 const next=h.switchUser();h.pending[0].resolve();await work;
 assert.equal(h.ctx.S,next);assert.equal(h.ctx.liveMode,false);assert.equal(h.els.live.style.display,'none');
});
test('old commissioner failed pause cannot restore stale state into new login',async()=>{
 const h=actionHarness(),work=h.els.pause.onclick();assert.equal(h.pending.length,1);
 const next=h.switchUser();h.pending[0].reject(Error('synthetic conflict'));await work;
 assert.equal(h.ctx.S,next);assert.equal(h.renders(),0);
});
test('current commissioner failed pause still rolls back optimistic change',async()=>{
 const h=actionHarness(),before=JSON.stringify(h.ctx.S),work=h.els.pause.onclick();
 h.pending[0].reject(Error('synthetic conflict'));await work;
 assert.equal(JSON.stringify(h.ctx.S),before);
});

test('old commissioner successful pick cannot render or alter a replacement login',async()=>{
 const h=actionHarness(),work=h.ctx.doPick(0);
 assert.equal(h.pending.length,1);
 const next=h.switchUser();
 h.pending[0].resolve();await work;
 assert.equal(h.ctx.S,next);
 assert.deepEqual(next.picks,[{golfer:99}]);
 assert.equal(h.renders(),0);
});
test('old commissioner failed setup save cannot change replacement login view',async()=>{
 const h=actionHarness(),work=h.els.saveSetup.onclick();
 assert.equal(h.pending.length,1);
 const next=h.switchUser();
 h.pending[0].reject(Error('synthetic conflict'));await work;
 assert.equal(h.ctx.S,next);
 assert.equal(h.ctx.liveMode,false);
 assert.equal(h.els.live.style.display,'none');
});

test('old commissioner successful pause cannot update replacement login screen',async()=>{
 const h=actionHarness(),work=h.els.pause.onclick();
 assert.equal(h.pending.length,1);
 const next=h.switchUser();
 h.pending[0].resolve();await work;
 assert.equal(h.ctx.S,next);
 assert.equal(h.renders(),0);
 assert.equal(h.ctx.liveMode,false);
});
test('old commissioner rejected pick cannot reenable stale draft controls in replacement login',async()=>{
 const h=actionHarness(),work=h.ctx.doPick(0);
 const next=h.switchUser();
 h.pending[0].reject(Error('synthetic conflict'));await work;
 assert.equal(h.ctx.S,next);
 assert.equal(h.renders(),0);
 assert.deepEqual(next.picks,[{golfer:99}]);
});

test('current commissioner successful pick renders exactly once',async()=>{
 const h=actionHarness(),work=h.ctx.doPick(0);
 assert.equal(h.pending.length,1);
 h.pending[0].resolve();await work;
 assert.equal(h.ctx.S.picks.length,1);
 assert.equal(h.renders(),1);
});
test('current commissioner successful pause retains paused state',async()=>{
 const h=actionHarness();h.ctx.liveMode=true;
 const work=h.els.pause.onclick();
 assert.equal(h.pending.length,1);
 h.pending[0].resolve();await work;
 assert.equal(h.ctx.S.timerPaused,true);
 assert.equal(h.renders(),1);
});

test('current commissioner rejected pick restores the prior roster and redraws live mode',async()=>{
 const h=actionHarness();h.ctx.liveMode=true;
 const before=JSON.stringify(h.ctx.S);
 const work=h.ctx.doPick(0);
 assert.equal(h.pending.length,1);
 h.pending[0].reject(Error('synthetic conflict'));await work;
 assert.equal(JSON.stringify(h.ctx.S),before);
 assert.equal(h.renders(),1);
});

test('old commissioner resize save cannot update replacement login controls',async()=>{
 const h=actionHarness(),work=h.els.applySetupSize.onclick();
 assert.equal(h.pending.length,1,'resize must use secure save');
 const next=h.switchUser();
 h.pending[0].resolve();await work;
 assert.equal(h.ctx.S,next);
 assert.equal(h.els.setupSizeMsg.textContent,'');
});
test('current commissioner resize failure restores original setup',async()=>{
 const h=actionHarness(),original=structuredClone(h.ctx.S),work=h.els.applySetupSize.onclick();
 assert.equal(h.pending.length,1);
 h.pending[0].reject(Error('synthetic save failure'));await work;
 assert.deepEqual(h.ctx.S,original);
 assert.equal(h.els.applySetupSize.disabled,false);
 assert.match(h.els.setupSizeMsg.textContent,/synthetic save failure/);
});

test('commissioner cannot rewrite draft setup after a pick, even by invoking handler directly',async()=>{
 const h=actionHarness();
 h.ctx.S.picks.push({golfer:0,team:0});
 const original=JSON.stringify(h.ctx.S);
 await h.els.saveSetup.onclick();
 assert.equal(JSON.stringify(h.ctx.S),original,'live draft state must remain untouched');
 assert.equal(h.pending.length,0,'no database save is attempted');
 assert.equal(h.els.saveSetup.disabled,true,'Save Setup remains locked');
 assert.match(h.els.setupSizeMsg.textContent,/Cannot resize after draft picks/);
});
test('commissioner cannot resize setup after an assigned roster, even with no pick record',async()=>{
 const h=actionHarness();
 h.ctx.S.teams[0].roster.push(0);
 const original=JSON.stringify(h.ctx.S);
 await h.els.applySetupSize.onclick();
 assert.equal(JSON.stringify(h.ctx.S),original);
 assert.equal(h.pending.length,0);
 assert.equal(h.els.applySetupSize.disabled,true);
 assert.match(h.els.setupSizeMsg.textContent,/Cannot resize after draft picks/);
});


// Interactive commissioner login must fence a restored session before
// Supabase emits SIGNED_IN, while stale login failures cannot repaint the UI.
const loginHandlerStart=source.indexOf('document.getElementById("login").onclick=async()=>{');
const loginHandlerEnd=source.indexOf('document.getElementById("refreshRsvpPreview").onclick',loginHandlerStart);
const revokeSectionEnd=source.indexOf('async function openAdmin(){',authStart);
assert.ok(loginHandlerStart>0&&loginHandlerEnd>loginHandlerStart&&revokeSectionEnd>authStart);
function commissionerLoginHarness(initialUserId=null){
 const events=[],pending=[];
 const els={
  login:{disabled:false,textContent:'Sign In'},
  email:{value:'replacement@example.invalid'},
  password:{value:'synthetic-password'},
  authMsg:{textContent:''},
  connection:{textContent:'READY'},
  loginCard:{style:{display:'none'}},
  adminApp:{style:{display:'block'}},
  refreshRsvpPreview:{disabled:false},
  rsvpReadinessStatus:{textContent:''}
 };
 const controls=[{disabled:false}];
 let onAuthEvent;
 const ctx={
  commissionerAuthEpoch:3,commissionerOpenId:7,commissionerUserId:initialUserId,
  commissionerChannel:null,draftUpdatedAt:'2026-10-27T00:00:00Z',
  rsvpPreviewController:{invalidate:()=>events.push('invalidate')},
  document:{getElementById:id=>els[id],querySelectorAll:()=>controls},
  db:{auth:{
   onAuthStateChange:fn=>{onAuthEvent=fn},
   signInWithPassword:()=>{events.push('signIn');return new Promise(resolve=>pending.push(resolve))}
  }},
  openAdmin:async()=>events.push('openAdmin'),
  console:{error:()=>{}}
 };
 vm.createContext(ctx);
 vm.runInContext(source.slice(authStart,revokeSectionEnd)+source.slice(loginHandlerStart,loginHandlerEnd),ctx);
 return {ctx,els,controls,events,pending,
  click:()=>els.login.onclick(),
  change:(event,session)=>onAuthEvent(event,session),
  resolve:(index,error=null)=>pending[index]({error}),
  user:()=>vm.runInContext('commissionerUserId',ctx),
  epoch:()=>vm.runInContext('commissionerAuthEpoch',ctx),
  openId:()=>vm.runInContext('commissionerOpenId',ctx)};
}
test('replacement commissioner sign-in retires old controls before SIGNED_IN event',async()=>{
 const h=commissionerLoginHarness('commissioner-old');
 const signingIn=h.click();
 assert.equal(h.user(),null);
 assert.equal(h.els.adminApp.style.display,'none');
 assert.equal(h.controls[0].disabled,true);
 assert.equal(h.epoch(),4);
 assert.equal(h.pending.length,1);
 h.change('SIGNED_IN',{user:{id:'commissioner-new'}});
 assert.equal(h.epoch(),4,'replacement auth event must not revoke the new login');
 h.resolve(0);
 await signingIn;
 assert.deepEqual(h.events.filter(e=>e==='openAdmin'),['openAdmin']);
 assert.equal(h.els.password.value,'');
 assert.equal(h.els.login.disabled,false);
});
test('explicit commissioner login invalidates a pending restored-session verification',async()=>{
 const h=commissionerLoginHarness();
 const originalEpoch=h.epoch(),originalOpenId=h.openId();
 const signingIn=h.click();
 assert.equal(h.epoch(),originalEpoch+1);
 assert.equal(h.openId(),originalOpenId+1);
 assert.equal(h.pending.length,1);
 h.resolve(0);
 await signingIn;
 assert.equal(h.events.filter(e=>e==='openAdmin').length,1);
});
test('failed commissioner replacement login leaves previous controls revoked',async()=>{
 const h=commissionerLoginHarness('commissioner-old');
 const signingIn=h.click();
 h.resolve(0,new Error('synthetic invalid credentials'));
 await signingIn;
 assert.equal(h.user(),null);
 assert.equal(h.els.adminApp.style.display,'none');
 assert.equal(h.els.connection.textContent,'ERROR');
 assert.match(h.els.authMsg.textContent,/synthetic invalid credentials/);
 assert.equal(h.events.includes('openAdmin'),false);
});
test('stale commissioner login error cannot overwrite a later sign-out state',async()=>{
 const h=commissionerLoginHarness('commissioner-old');
 const signingIn=h.click();
 h.change('SIGNED_OUT',null);
 const revokedEpoch=h.epoch();
 h.resolve(0,new Error('synthetic stale failure'));
 await signingIn;
 assert.equal(h.epoch(),revokedEpoch);
 assert.equal(h.els.connection.textContent,'SIGN IN');
 assert.match(h.els.authMsg.textContent,/session changed/i);
 assert.equal(h.events.includes('openAdmin'),false);
 assert.equal(h.els.login.disabled,false);
});
