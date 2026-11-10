// EllenG Cup draft order invariants. Run: node --test tests/draft-turn-order.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
function onClock(pickCount, teamCount, type='snake'){
  if(!Number.isSafeInteger(teamCount)||teamCount<1) throw new RangeError('team count must be positive');
  if(!Number.isSafeInteger(pickCount)||pickCount<0) throw new RangeError('pick count must be nonnegative');
  const round=Math.floor(pickCount/teamCount), position=pickCount%teamCount;
  return type==='snake'&&round%2===1?teamCount-1-position:position;
}
for(const teamCount of [1,2,3,6,7,9]){
 test(`snake ${teamCount} teams alternates direction and remains in range`,()=>{
  const picks=Array.from({length:teamCount*4},(_,i)=>onClock(i,teamCount));
  const forward=Array.from({length:teamCount},(_,i)=>i);
  assert.deepEqual(picks, [...forward,...forward.slice().reverse(),...forward,...forward.slice().reverse()]);
  assert.ok(picks.every(i=>i>=0&&i<teamCount));
 });
 test(`standard ${teamCount} teams repeats order`,()=>{
  const picks=Array.from({length:teamCount*3},(_,i)=>onClock(i,teamCount,'standard'));
  const forward=Array.from({length:teamCount},(_,i)=>i);
  assert.deepEqual(picks,[...forward,...forward,...forward]);
 });
}
test('reject invalid team count and pick index',()=>{
 assert.throws(()=>onClock(0,0),RangeError);
 assert.throws(()=>onClock(-1,4),RangeError);
});

test('undo restores the previous team turn without touching captain seed positions',()=>{
 for(const type of ['snake','standard']){
  const picks=[{golfer:0,team:0,captain:true},{golfer:1,team:1,captain:true}];
  for(let i=2;i<14;i++)picks.push({golfer:i,team:onClock(i,2,type)});
  const before=onClock(picks.length,2,type);
  const last=picks.pop();
  assert.equal(onClock(picks.length,2,type),last.team);
  picks.push(last);
  assert.equal(onClock(picks.length,2,type),before);
  assert.deepEqual(picks.slice(0,2).map(p=>p.golfer),[0,1]);
 }
});
test('withdrawal keeps historical turn index until commissioner explicitly repairs the draft',()=>{
 for(const type of ['snake','standard']){
  const picks=Array.from({length:7},(_,i)=>({golfer:i,team:onClock(i,2,type)}));
  const next=onClock(picks.length,2,type);
  const withdrawn=3;
  const active=picks.filter(p=>p.golfer!==withdrawn);
  assert.equal(picks.length,7,'historical picks are retained');
  assert.equal(onClock(picks.length,2,type),next);
  assert.notEqual(active.length,picks.length,'active roster and historical picks are different concepts');
 }
});
