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
