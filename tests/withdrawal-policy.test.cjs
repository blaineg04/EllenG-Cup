"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {activeRoster,preflightWithdrawal,previewWithdrawal}=require("../lib/withdrawal-policy.cjs");
const makeState=()=>({
 golfers:Array.from({length:24},(_,i)=>({name:i===0?"Jarad Jones":i===12?"Carl LeMaire":`Golfer ${i}`,team:i<12?0:1,participating:true,late_added:i===23})),
 teams:[{captain:"Jarad Jones",roster:Array.from({length:12},(_,i)=>i)},{captain:"Carl LeMaire",roster:Array.from({length:12},(_,i)=>i+12)}],
 picks:Array.from({length:23},(_,i)=>({golfer:i})),
});
const args=(state,idx)=>({state,golferIndex:idx,scoresExist:false,expectedUpdatedAt:"v1",actualUpdatedAt:"v1"});
test("withdraw a drafted golfer without changing picks, roster or account index",()=>{
 const s=makeState(),original=JSON.stringify(s),result=previewWithdrawal(args(s,13));
 assert.equal(result.ok,true);
 assert.deepEqual(result.activeCounts,[12,11]);
 assert.equal(result.state.golfers[13].withdrawn,true);
 assert.equal(result.state.golfers[13].participating,false);
 assert.deepEqual(result.state.picks,s.picks);
 assert.deepEqual(result.state.teams,s.teams);
 assert.equal(JSON.stringify(s),original);
});
test("withdraw a late-added golfer without altering original 23 picks",()=>{
 const result=previewWithdrawal(args(makeState(),23));
 assert.equal(result.ok,true);
 assert.deepEqual(result.activeCounts,[12,11]);
 assert.equal(result.state.picks.length,23);
});
test("captains cannot be withdrawn",()=>{
 assert.match(preflightWithdrawal(args(makeState(),0)).reason,/Captain/);
 assert.match(preflightWithdrawal(args(makeState(),12)).reason,/Captain/);
});
test("fail closed when scores exist, unknown, or timestamp stale",()=>{
 const s=makeState();
 assert.equal(preflightWithdrawal({...args(s,13),scoresExist:true}).ok,false);
 assert.equal(preflightWithdrawal({...args(s,13),scoresExist:undefined}).ok,false);
 assert.equal(preflightWithdrawal({...args(s,13),actualUpdatedAt:"v2"}).ok,false);
});
test("cannot withdraw twice or an unassigned golfer",()=>{
 const s=makeState();s.golfers[13].participating=false;
 assert.equal(preflightWithdrawal(args(s,13)).ok,false);
 const s2=makeState();s2.teams[1].roster=s2.teams[1].roster.filter(i=>i!==13);
 assert.equal(preflightWithdrawal(args(s2,13)).ok,false);
});
test("active roster counts ignore withdrawn golfers and duplicates",()=>{
 const s=makeState();s.golfers[13].participating=false;s.teams[1].roster.push(14);
 assert.equal(activeRoster(s,1).length,11);
});

test("two sequential withdrawals remain valid with uneven teams",()=>{
 const first=previewWithdrawal(args(makeState(),13));
 assert.equal(first.ok,true);
 const second=previewWithdrawal(args(first.state,14));
 assert.equal(second.ok,true);
 assert.deepEqual(second.activeCounts,[12,10]);
 assert.equal(second.state.picks.length,23);
});
test("unstarted draft is rejected",()=>{
 const state=makeState();state.picks=state.picks.slice(0,8);
 assert.equal(preflightWithdrawal(args(state,13)).ok,false);
});
