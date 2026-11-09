const test=require('node:test'),assert=require('node:assert/strict');
const {summarize}=require('../shamble-points.js');
const golfers=Array.from({length:23},(_,i)=>({name:'Fixture golfer '+i,team:i<12?0:1}));
const teams=[{name:'A',roster:Array.from({length:12},(_,i)=>i)},{name:'B',roster:Array.from({length:11},(_,i)=>i+12)}];
const state={golfers,teams},pars=Array(18).fill(4);
const row=(g,h,score)=>({golfer_index:g,team_index:g<12?0:1,hole:h,score});
const all=(h,a,b)=>golfers.map((_,g)=>row(g,h,g<12?a:b));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`Expected ${a} to equal ${b}`);
test('uneven rosters: winning Gator bonus is ten points, not twelve',()=>{
 const result=summarize(state,all(7,5,3),pars,7);
 assert.deepEqual(result.gatorBonus,[0,10]);
 assert.equal(result.completeHoles,1);
 assert.equal(result.totals[0].rawPoints,24);
 assert.equal(result.totals[1].rawPoints,44);
 close(result.totals[0].rankPoints,24);
 close(result.totals[1].rankPoints,44/11*12+10);
 assert.equal(result.totals[1].pts,54);
});
test('uneven rosters: tied Gator averages split ten points five each',()=>{
 const result=summarize(state,all(2,4,4),pars,2);
 assert.deepEqual(result.gatorBonus,[5,5]);
 assert.equal(result.totals[0].rawPoints,36);
 assert.equal(result.totals[1].rawPoints,33);
 close(result.totals[0].rankPoints,41);
 close(result.totals[1].rankPoints,41);
 close(result.totals[0].average,result.totals[1].average);
});
test('missing one golfer prevents Gator bonus and complete-hole status',()=>{
 const result=summarize(state,all(5,4,3).filter(x=>x.golfer_index!==22),pars,5);
 assert.deepEqual(result.gatorBonus,[0,0]);assert.equal(result.completeHoles,0);
 assert.equal(result.holes[4][1].entered,10);assert.equal(result.holes[4][1].expected,11);
});
test('correction recomputes points and bonus without double counting',()=>{
 const original=all(3,4,4),corrected=original.map(r=>r.golfer_index===12?{...r,score:3}:r);
 const before=summarize(state,original,pars,3),after=summarize(state,corrected,pars,3);
 assert.deepEqual(before.gatorBonus,[5,5]);assert.deepEqual(after.gatorBonus,[0,10]);
 assert.equal(after.players[12].points,before.players[12].points+1);
 assert.equal(after.holes[2][1].entered,11);
 assert.equal(after.completeHoles,1);
});
test('414 scores: independent sum matches raw points and normalized ranking',()=>{
 const rows=[];for(let h=1;h<=18;h++)rows.push(...all(h,h%2?4:3,h%3?4:5));
 const result=summarize(state,rows,pars,18);
 assert.equal(result.completeHoles,18);assert.equal(rows.length,414);
 for(let ti=0;ti<2;ti++){
  const expected=rows.filter(r=>r.team_index===ti).reduce((n,r)=>n+Math.max(0,Math.min(5,7-r.score)),0);
  assert.equal(result.totals[ti].rawPoints,expected);
  close(result.totals[ti].rankPoints,expected/(ti===0?12:11)*12+result.gatorBonus[ti]);
 }
});
