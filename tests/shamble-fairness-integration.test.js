const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarize}=require('../shamble-points.js');
function state(a,b){
 const n=a+b,golfers=Array.from({length:n},(_,i)=>({name:'Golfer '+i,participating:true,team:i<a?0:1}));
 return {golfers,teams:[{roster:Array.from({length:a},(_,i)=>i)},{roster:Array.from({length:b},(_,i)=>a+i)}]};
}
function scores(a,b,scoreA,scoreB,hole=1){
 return [...Array.from({length:a},(_,i)=>({golfer_index:i,team_index:0,hole,score:scoreA})),...Array.from({length:b},(_,i)=>({golfer_index:a+i,team_index:1,hole,score:scoreB}))];
}
test('actual shamble engine ranks odd fields using normalized points',()=>{
 for(let n=3;n<=31;n+=2){
  const a=Math.ceil(n/2),b=Math.floor(n/2),s=state(a,b);
  const x=summarize(s,scores(a,b,4,3),Array(18).fill(4));
  assert.equal(x.totals[1].rankPoints>x.totals[0].rankPoints,true,'field '+n);
  assert.equal(x.totals[0].golfers,a);
  assert.equal(x.totals[1].golfers,b);
 }
});
test('actual shamble Gator bonus uses average points and splits ties',()=>{
 const s=state(6,5);
 const win=summarize(s,scores(6,5,4,3),Array(18).fill(4),1);
 assert.deepEqual(win.gatorBonus,[0,10]);
 const tie=summarize(s,scores(6,5,4,4),Array(18).fill(4),1);
 assert.deepEqual(tie.gatorBonus,[5,5]);
});
test('actual shamble Gator bonus is withheld until every golfer enters',()=>{
 const s=state(6,5),rows=scores(6,5,4,3).slice(0,-1);
 const x=summarize(s,rows,Array(18).fill(4),1);
 assert.deepEqual(x.gatorBonus,[0,0]);
 assert.equal(x.holes[0][1].complete,false);
});
test('incomplete individual scores do not silently count as a completed hole',()=>{
 const s=state(8,7),rows=scores(8,7,4,4).slice(0,4);
 const x=summarize(s,rows,Array(18).fill(4));
 assert.equal(x.completeHoles,0);
 assert.equal(x.holes[0][0].entered,4);
 assert.equal(x.holes[0][0].expected,8);
});
