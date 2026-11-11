const assert=require('node:assert/strict');
const {test}=require('node:test');
const {plan}=require('../captain-fairness.js');
function draft(n,a='B',b='A'){
 const golfers=Array.from({length:n},(_,i)=>({name:'Golfer '+i,participating:true,self_ranked:true,band:i===0?a:i===1?b:'C'}));
 return {golfers,teams:[{captainGolferIndex:0},{captainGolferIndex:1}]};
}
test('weaker B captain receives first pick and extra golfer at 23',()=>{
 const p=plan(draft(23));assert.equal(p.firstOrdinaryPickTeam,0);assert.deepEqual(p.capacities,[12,11]);
});
test('reverse captain strengths reverses preferential team',()=>{
 const p=plan(draft(23,'A','B'));assert.equal(p.firstOrdinaryPickTeam,1);assert.deepEqual(p.capacities,[11,12]);
});
test('even fields have equal capacity without assuming 23',()=>{
 for(const n of [2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32])assert.deepEqual(plan(draft(n)).capacities,[n/2,n/2]);
});
test('equal captains require neutral tiebreak rather than arbitrary first pick',()=>{
 const p=plan(draft(23,'B','B'));assert.equal(p.firstOrdinaryPickTeam,null);assert.equal(p.requiresTiebreak,true);
});
test('unranked captain fails closed',()=>{
 const d=draft(23);d.golfers[1].self_ranked=false;assert.throws(()=>plan(d),/ranked/);
});

test('every supported odd field allocates the extra golfer to the weaker captain',()=>{
 for(let n=3;n<=31;n+=2){
  const p=plan(draft(n));
  assert.deepEqual(p.capacities,[Math.ceil(n/2),Math.floor(n/2)],'field '+n);
  assert.equal(p.capacities[0]+p.capacities[1],n);
  const reversed=plan(draft(n,'A','B'));
  assert.deepEqual(reversed.capacities,[Math.floor(n/2),Math.ceil(n/2)],'reversed field '+n);
 }
});
test('every supported field allocates all golfers exactly once',()=>{
 for(let n=2;n<=32;n++){
  const p=plan(draft(n));
  assert.equal(p.capacities[0]+p.capacities[1],n);
  assert.ok(Math.abs(p.capacities[0]-p.capacities[1])<=1);
 }
});
