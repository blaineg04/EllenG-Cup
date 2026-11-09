const test=require('node:test'),assert=require('node:assert/strict');
const {summarize}=require('../shamble-points.js');
const pars=Array(18).fill(4);
function scenario(count){
 const golfers=Array.from({length:24},(_,i)=>({name:'Golfer '+i,team:i<12?0:1,participating:i<count}));
 const teams=[{roster:Array.from({length:12},(_,i)=>i)},{roster:Array.from({length:12},(_,i)=>12+i)}];
 // Model pre-draft changes while retaining obsolete team entries and stored scores.
 const rows=[];for(let h=1;h<=18;h++)for(let g=0;g<24;g++)rows.push({golfer_index:g,team_index:g<12?0:1,hole:h,score:4});
 return {state:{golfers,teams},rows};
}
for(const count of [22,23,24]){
 test(`${count} participants: withdrawn golfers do not contribute scores or block completion`,()=>{
  const {state,rows}=scenario(count),summary=summarize(state,rows,pars,18);
  assert.equal(summary.completeHoles,18);
  assert.equal(summary.totals[0].golfers,12);
  assert.equal(summary.totals[1].golfers,count-12);
  assert.equal(summary.totals[0].rawPoints,12*18*3);
  assert.equal(summary.totals[1].rawPoints,(count-12)*18*3);
  assert.deepEqual(summary.gatorBonus,[5,5]);
  for(let i=count;i<24;i++){assert.equal(summary.players[i].holes,0);assert.equal(summary.players[i].points,0);assert.equal(summary.players[i].team,undefined)}
 });
}
test('newly active golfer requires a score before Gator Hole completes',()=>{
 const {state,rows}=scenario(23);
 let s=summarize(state,rows.filter(r=>r.golfer_index!==22),pars,18);
 assert.equal(s.completeHoles,17);assert.deepEqual(s.gatorBonus,[0,0]);
 s=summarize(state,rows,pars,18);assert.equal(s.completeHoles,18);assert.deepEqual(s.gatorBonus,[5,5]);
});
