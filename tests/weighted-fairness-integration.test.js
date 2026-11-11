const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../captain-fairness.js');
const {options}=require('../weighted-draft.js');
function seeded(n,reverse=false,version=2){
 const golfers=Array.from({length:n},(_,i)=>({name:'Golfer '+i,participating:true,self_ranked:true,band:i===0?(reverse?'A':'B'):i===1?(reverse?'B':'A'):'C',team:i<2?i:null}));
 return {golfers,teams:[{captainGolferIndex:0,roster:[0]},{captainGolferIndex:1,roster:[1]}],picks:[{golfer:0,team:0,captain:true},{golfer:1,team:1,captain:true}],draftRules:'weighted',balanceVersion:version,draftType:'snake'};
}
test('version 2 weighted options honors weaker captain capacity for all odd fields',()=>{
 for(let n=3;n<=31;n+=2){
  const s=seeded(n);
  const result=options(s);
  assert.deepEqual(result.capacities,[Math.ceil(n/2),Math.floor(n/2)],'field '+n);
  assert.ok(result.eligible[0].includes('C'),'first ordinary pick must allow C for field '+n);
 }
});
test('version 2 reverses capacity when captain strengths reverse',()=>{
 for(let n=3;n<=31;n+=2)assert.deepEqual(options(seeded(n,true)).capacities,[Math.floor(n/2),Math.ceil(n/2)],'field '+n);
});
test('version 1 remains unchanged for already prepared drafts',()=>{
 const s=seeded(23,false,1);
 assert.deepEqual(options(s).capacities,[11,12]);
});
test('version 2 refuses equal captain strengths without neutral tiebreak',()=>{
 const s=seeded(11);s.golfers[1].band='B';
 assert.throws(()=>options(s),/tiebreak/);
});
