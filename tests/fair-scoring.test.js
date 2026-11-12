const {test}=require('node:test');
const assert=require('node:assert/strict');
const {rank,gatorBonus}=require('../fair-scoring.js');
test('uneven rosters rank by average points rather than raw totals',()=>{
 const ranked=rank([{golfers:12,points:648},{golfers:11,points:616}]);
 assert.equal(ranked[0].team,1);assert.equal(ranked[0].average,56);assert.equal(ranked[0].uneven,true);
});
test('even rosters retain raw team totals',()=>{
 const ranked=rank([{golfers:12,points:648},{golfers:12,points:616}]);
 assert.equal(ranked[0].team,0);assert.equal(ranked[0].uneven,false);
});
test('odd rosters work for every field from 3 to 31',()=>{
 for(let n=3;n<=31;n+=2){
  const a=Math.ceil(n/2),b=Math.floor(n/2);
  const ranked=rank([{golfers:a,points:a*50},{golfers:b,points:b*52}]);
  assert.equal(ranked[0].team,1,'field '+n);
 }
});
test('Gator bonus compares average points per golfer',()=>{
 assert.deepEqual(gatorBonus([{golfers:12,holePoints:36,complete:true},{golfers:11,holePoints:44,complete:true}]),[0,10]);
 assert.deepEqual(gatorBonus([{golfers:12,holePoints:36,complete:true},{golfers:11,holePoints:33,complete:true}]),[5,5]);
});
test('Gator bonus remains pending until both teams complete',()=>{
 assert.deepEqual(gatorBonus([{golfers:12,holePoints:36,complete:true},{golfers:11,holePoints:44,complete:false}]),[0,0]);
});
test('rejects empty rosters and invalid totals',()=>{
 assert.throws(()=>rank([{golfers:0,points:0},{golfers:1,points:1}]),/at least one/);
 assert.throws(()=>rank([{golfers:1,points:NaN},{golfers:1,points:1}]),/nonnegative/);
});
