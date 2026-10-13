const test=require('node:test');
const assert=require('node:assert/strict');
const {totalPoints,distributions,rows}=require('../scripts/quota-scenarios-v2.cjs');
test('all illustrative rounds contain exactly 18 holes and yield finite totals',()=>{
 for(const rounds of Object.values(distributions))for(const round of rounds){
  assert.equal(Object.values(round).reduce((a,b)=>a+b,0),18);
  assert.ok(Number.isFinite(totalPoints(round)));
 }
});
test('illustrative calibration yields expected deterministic quotas',()=>{
 assert.deepEqual(Object.fromEntries(rows.map(row=>[row.band,row.suggestedQuota])),
  {A:23,B:20,C:16,D:10});
});
test('suggested quotas reduce maximum hit-rate gap in illustrative sample',()=>{
 const range=values=>Math.max(...values)-Math.min(...values);
 assert.ok(range(rows.map(r=>r.suggestedHitRate))<range(rows.map(r=>r.initialHitRate)));
});
