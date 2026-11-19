'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {simulateTransfer}=require('../lib/post-draft-team-transfer-simulator.cjs');
const draft=()=>({golfers:[{name:'Jarad',team:0},{name:'Carl',team:1},{name:'A',team:0},{name:'B',team:1}],teams:[{captain:'Jarad',roster:[0,2]},{captain:'Carl',roster:[1,3]}],picks:[{golfer:2,team:0}],scoreRows:[{golfer_index:2,strokes:4}],metadata:{status:'drafted'}});
test('move changes both rosters and golfer team but never mutates input',()=>{const s=draft(),original=JSON.stringify(s);const r=simulateTransfer(s,{operation:'move',golferIndex:2,destinationTeamIndex:1,scoresExist:false,draftComplete:true,tournamentStatus:'setup'});assert.equal(r.ok,true);assert.deepEqual(r.state.teams.map(t=>t.roster),[[0],[1,3,2]]);assert.equal(r.state.golfers[2].team,1);assert.equal(JSON.stringify(s),original);assert.deepEqual(r.state.picks,s.picks);assert.deepEqual(r.state.scoreRows,s.scoreRows)});
test('swap keeps team sizes, draft picks and identity stable',()=>{const s=draft(),r=simulateTransfer(s,{operation:'swap',golferIndex:2,otherGolferIndex:3,scoresExist:false,draftComplete:true,tournamentStatus:'setup'});assert.equal(r.ok,true);assert.deepEqual(r.state.teams.map(t=>t.roster),[[0,3],[1,2]]);assert.equal(r.state.golfers[2].team,1);assert.equal(r.state.golfers[3].team,0);assert.deepEqual(r.state.picks,s.picks)});
test('reject score-present transfer without mutation',()=>{const s=draft(),before=JSON.stringify(s),r=simulateTransfer(s,{operation:'move',golferIndex:2,destinationTeamIndex:1,scoresExist:true,draftComplete:true,tournamentStatus:'setup'});assert.equal(r.ok,false);assert.equal(JSON.stringify(s),before)});
test('preserve object roster entries',()=>{const s=draft();s.teams[0].roster[1]={golferIndex:2,tag:'keep'};const r=simulateTransfer(s,{operation:'move',golferIndex:2,destinationTeamIndex:1,scoresExist:false,draftComplete:true,tournamentStatus:'setup'});assert.deepEqual(r.state.teams[1].roster[2],{golferIndex:2,tag:'keep'})});

for (const count of [21,22,23,24,40]) {
 test('preserve all golfer identities and picks for '+count+' golfers',()=>{
  const s=draft();
  for(let i=4;i<count;i++){
   const team=i%2;
   s.golfers.push({name:'Golfer '+i,team,participating:true});
   s.teams[team].roster.push(i);
  }
  const before=JSON.stringify(s);
  const result=simulateTransfer(s,{operation:'swap',golferIndex:2,otherGolferIndex:3,scoresExist:false,draftComplete:true,tournamentStatus:'setup'});
  assert.equal(result.ok,true);
  assert.equal(JSON.stringify(s),before);
  assert.equal(result.state.golfers.length,count);
  assert.deepEqual(result.state.picks,s.picks);
  assert.deepEqual(result.state.scoreRows,s.scoreRows);
  const indexes=result.state.teams.flatMap(t=>t.roster);
  assert.equal(indexes.length,count);
  assert.equal(new Set(indexes).size,count);
  for(let i=0;i<count;i++)assert.equal(result.state.golfers[i].team,result.state.teams.findIndex(t=>t.roster.includes(i)));
 });
}
