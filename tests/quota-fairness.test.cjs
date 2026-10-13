const test=require('node:test');
const assert=require('node:assert/strict');
const {assess}=require('../quota-fairness.js');
const groups={
 A:[20,22,24,26,28],
 B:[17,19,21,23,25],
 C:[12,14,16,18,20],
 D:[6,8,10,12,14]
};
const quotas={A:24,B:21,C:16,D:10};
test('fairness report includes all four bands and both parity measures',()=>{
 const r=assess(groups,quotas);
 assert.equal(r.ok,true);
 assert.deepEqual(Object.keys(r.metrics),['A','B','C','D']);
 assert.equal(r.hitRateGap,0);
 assert.equal(r.averageBonusGap,0);
 assert.equal(r.provisional,true);
});
test('report flags missing and insufficient band samples',()=>{
 assert.equal(assess({...groups,D:[]},quotas).ok,false);
 assert.equal(assess({...groups,D:undefined},quotas).ok,false);
});
test('report rejects invalid quotas and sample points',()=>{
 assert.equal(assess(groups,{...quotas,A:-1}).ok,false);
 assert.equal(assess({...groups,B:[1,2,3,4,NaN]},quotas).ok,false);
});
test('provisional flag clears at 20 samples per band',()=>{
 const expanded=Object.fromEntries(Object.entries(groups).map(([band,rounds])=>[band,Array(4).fill(rounds).flat()]));
 const r=assess(expanded,quotas);
 assert.equal(r.ok,true);
 assert.equal(r.provisional,false);
});
test('fairness gap detects an advantaged group',()=>{
 const r=assess(groups,{...quotas,D:0});
 assert.equal(r.ok,true);
 assert.ok(r.hitRateGap>0);
 assert.ok(r.averageBonusGap>0);
});
