const test=require('node:test');
const assert=require('node:assert/strict');
const {plan}=require('../uneven-teams.js');
test('24 golfers form six equal four-player teams without warnings',()=>{
 const r=plan(24,6);
 assert.equal(r.ok,true);
 assert.deepEqual(r.sizes,[4,4,4,4,4,4]);
 assert.equal(r.uneven,false);
 assert.equal(r.requiresCommissionerReview,false);
});
test('22 golfers distribute across six teams with every golfer included',()=>{
 const r=plan(22,6);
 assert.equal(r.ok,true);
 assert.deepEqual(r.sizes,[4,4,4,4,3,3]);
 assert.equal(r.sizes.reduce((a,b)=>a+b,0),22);
 assert.equal(r.requiresCommissionerReview,true);
});
test('19 golfers distribute across five teams without excluding anyone',()=>{
 const r=plan(19,5);
 assert.deepEqual(r.sizes,[4,4,4,4,3]);
 assert.equal(r.sizes.reduce((a,b)=>a+b,0),19);
});
test('27 golfers distribute across seven teams without excluding anyone',()=>{
 const r=plan(27,7);
 assert.deepEqual(r.sizes,[4,4,4,4,4,4,3]);
 assert.equal(r.sizes.reduce((a,b)=>a+b,0),27);
});
test('11 golfers in 2v2 format flags commissioner pairing review',()=>{
 const r=plan(11,6,'two-v-two');
 assert.equal(r.ok,true);
 assert.deepEqual(r.sizes,[2,2,2,2,2,1]);
 assert.equal(r.requiresCommissionerReview,true);
 assert.ok(r.warnings.some(w=>w.includes('2v2')));
});
test('equal teams outside four-player scramble also need review',()=>{
 const r=plan(12,4);
 assert.equal(r.uneven,false);
 assert.equal(r.requiresCommissionerReview,true);
});
test('rejects invalid counts and unknown formats',()=>{
 for(const args of [[0,1],[1,0],[3,4],[2.5,1],[5,1.5],[5,2,'unknown']])
  assert.equal(plan(...args).ok,false);
});
test('all supported counts preserve roster total and size spread at most one',()=>{
 for(let n=1;n<=36;n++)for(let teams=1;teams<=n;teams++){
  const r=plan(n,teams);
  assert.equal(r.ok,true);
  assert.equal(r.sizes.reduce((a,b)=>a+b,0),n);
  assert.ok(Math.max(...r.sizes)-Math.min(...r.sizes)<=1);
 }
});
