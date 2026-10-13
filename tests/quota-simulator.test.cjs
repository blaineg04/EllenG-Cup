const test=require('node:test');
const assert=require('node:assert/strict');
const q=require('../quota-simulator.js');
test('hole points follow proposed 8/4/2/1/0 scale',()=>{
 const expected=[[2,8],[3,4],[4,2],[5,1],[6,0],[7,0]];
 for(const [strokes,points] of expected)assert.equal(q.pointsForStrokes(strokes,4),points);
});
test('ace on par three scores eagle or better',()=>assert.equal(q.pointsForStrokes(1,3),8));
test('invalid par or strokes rejected',()=>{
 assert.equal(q.pointsForStrokes(0,4),null);
 assert.equal(q.pointsForStrokes(4,6),null);
});
test('18-hole score totals accurately',()=>{
 const pars=Array(18).fill(4);
 assert.equal(q.scoreRound(Array(18).fill(4),pars),36);
 assert.equal(q.scoreRound(Array(18).fill(5),pars),18);
 assert.equal(q.scoreRound(Array(18).fill(6),pars),0);
});
test('incomplete round rejected',()=>assert.equal(q.scoreRound([4],[4]),null));
test('bonus only never subtracts points',()=>{
 assert.equal(q.bonus(20,24),0);
 assert.equal(q.bonus(30,24),6);
});
test('sample summaries calculate rate and mean bonus',()=>{
 const s=q.summarize([18,24,30],24);
 assert.equal(s.rounds,3);
 assert.equal(s.averagePoints,24);
 assert.equal(s.averageBonus,2);
 assert.equal(s.bonusRate,1/3);
});
test('empty samples and invalid quotas rejected',()=>{
 assert.equal(q.summarize([],24),null);
 assert.equal(q.summarize([10],-1),null);
});
