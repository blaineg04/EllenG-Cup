'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {previewTransfer}=require('../lib/post-draft-team-transfer-preview.cjs');
const {simulateTransfer}=require('../lib/post-draft-team-transfer-simulator.cjs');
const {validateTransferPostcondition}=require('../lib/post-draft-team-transfer-postcondition.cjs');
// Synthetic shape based on read-only schema inspection, NOT copied live golfer data.
function fixture(activeCount){
 const golfers=Array.from({length:70},()=>({name:'',team:null,participating:false}));
 const teams=[{captain:'Captain A',roster:[]},{captain:'Captain B',roster:[]}];
 for(let i=0;i<activeCount;i++){
  const team=i%2;
  golfers[i]={name:i===0?'Captain A':i===1?'Captain B':'Test Golfer '+i,team,participating:true,band:'C'};
  teams[team].roster.push(i);
 }
 return {golfers,teams,picks:Array.from({length:23},(_,i)=>({golfer:i,team:i%2})),timerPaused:true,playFormat:'shamble_points'};
}
const gate={scoresExist:false,draftComplete:true,tournamentStatus:'setup'};
for(const count of [21,22,23,24,40]){
 test('live-shaped 70 slots with '+count+' active golfers supports safe swap',()=>{
  const state=fixture(count),request={...gate,operation:'swap',golferIndex:2,otherGolferIndex:3};
  const result=simulateTransfer(state,request);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.state.golfers.length,70);
  assert.equal(result.state.teams.flatMap(t=>t.roster).length,count);
  assert.equal(validateTransferPostcondition(state,result.state,request).ok,true);
  assert.deepEqual(result.state.picks,state.picks);
 });
}
test('withdrawn golfer cannot be moved',()=>{
 const state=fixture(21);state.golfers[2].withdrawn=true;
 assert.equal(previewTransfer(state,{...gate,operation:'move',golferIndex:2,destinationTeamIndex:1}).ok,false);
});
test('draft with 23 picks is not automatically deemed complete',()=>{
 const state=fixture(24);
 assert.equal(previewTransfer(state,{...gate,draftComplete:false,operation:'move',golferIndex:2,destinationTeamIndex:1}).ok,false);
});
test('live-shaped fixture rejects any score-present transfer',()=>{
 const state=fixture(21);
 assert.equal(simulateTransfer(state,{...gate,scoresExist:true,operation:'swap',golferIndex:2,otherGolferIndex:3}).ok,false);
});
