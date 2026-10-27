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
 assert.match(s,/function revokeCaptainSession\(\)\{\s*captainAuthEpoch\+\+;\s*stopCaptainSubscription\(\)/);
});
