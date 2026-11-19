'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {simulateTransfer}=require('../lib/post-draft-team-transfer-simulator.cjs');
const {validateGuardedTransferDelta:guard}=require('../lib/post-draft-transfer-guard-delta.cjs');
const fixture=()=>({draftRules:'weighted',golfers:[{name:'Captain A',team:0},{name:'Captain B',team:1},{name:'A',team:0},{name:'B',team:1}],teams:[{captain:'Captain A',roster:[0,2]},{captain:'Captain B',roster:[1,3]}],picks:[{golfer:2,team:0}]});
const gate={scoresExist:false,draftComplete:true,tournamentStatus:'setup'};
for(const operation of ['move','swap']){
 const request=operation==='move'?{...gate,operation,golferIndex:2,destinationTeamIndex:1}:{...gate,operation,golferIndex:2,otherGolferIndex:3};
 test('accept exact '+operation+' delta',()=>{
  const old=fixture(),r=simulateTransfer(old,request);
  assert.equal(r.ok,true,r.reason);assert.equal(guard(old,r.state,request).ok,true);
 });
 test('reject '+operation+' with extra golfer mutation',()=>{
  const old=fixture(),r=simulateTransfer(old,request);r.state.golfers[0].band='A';
  assert.equal(guard(old,r.state,request).ok,false);
 });
 test('reject '+operation+' with unchanged rosters',()=>{
  const old=fixture(),r=simulateTransfer(old,request);r.state.teams=old.teams;
  assert.equal(guard(old,r.state,request).ok,false);
 });
}
test('reject non-weighted draft',()=>{
 const old=fixture(),req={...gate,operation:'move',golferIndex:2,destinationTeamIndex:1};
 const r=simulateTransfer(old,req);old.draftRules='standard';
 assert.equal(guard(old,r.state,req).ok,false);
});
test('reject picks modified after swap',()=>{
 const old=fixture(),req={...gate,operation:'swap',golferIndex:2,otherGolferIndex:3};
 const r=simulateTransfer(old,req);r.state.picks.push({golfer:3,team:1});
 assert.equal(guard(old,r.state,req).ok,false);
});
