const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluate,recommend,compareBands}=require('../quota-calibration.js');
test('evaluation calculates bonus rate and average',()=>{
 const r=evaluate([10,20,30,40],20);
 assert.equal(r.hitRate,0.5);
 assert.equal(r.averageBonus,7.5);
});
test('quota recommendation finds a 50% hit rate when attainable',()=>{
 const r=recommend([10,20,30,40],{targetHitRate:0.5,maxQuota:50});
 assert.equal(r.hitRate,0.5);
 assert.equal(r.quota,29);
});
test('calibration rejects empty and invalid samples',()=>{
 assert.equal(evaluate([],10),null);
 assert.equal(evaluate([12,-1],10),null);
 assert.equal(recommend([10],{targetHitRate:1.5}),null);
});
test('band comparison returns four independent results',()=>{
 const groups={A:[22,24,26,28],B:[16,18,20,22],C:[10,12,14,16],D:[4,6,8,10]};
 const quotas={A:24,B:18,C:12,D:6};
 const result=compareBands(groups,quotas);
 assert.deepEqual(Object.keys(result),['A','B','C','D']);
 for(const band of Object.keys(result))assert.equal(result[band].hitRate,0.5);
});
test('band comparison rejects missing band',()=>{
 assert.equal(compareBands({A:[20]}, {A:15}),null);
});
