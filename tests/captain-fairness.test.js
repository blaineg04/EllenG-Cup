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
 for(const n of [22,24,26])assert.deepEqual(plan(draft(n)).capacities,[n/2,n/2]);
});
test('equal captains require neutral tiebreak rather than arbitrary first pick',()=>{
 const p=plan(draft(23,'B','B'));assert.equal(p.firstOrdinaryPickTeam,null);assert.equal(p.requiresTiebreak,true);
});
test('unranked captain fails closed',()=>{
 const d=draft(23);d.golfers[1].self_ranked=false;assert.throws(()=>plan(d),/ranked/);
});
