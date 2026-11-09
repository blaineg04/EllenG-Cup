const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('scoring.html','utf8');
const start=html.indexOf('function renderShambleScoring(');
const end=html.indexOf('function beginScoreSave(',start);
assert(start>=0&&end>start,'Shamble scoring renderer missing');
const view=html.slice(start,end);
test('score entry instructions reflect all three hole formats',()=>{
 for(const text of ['Par 3: own ball tee-to-cup','Par 4: best drive, then own ball','Par 5: best first two shots, then own ball'])assert.ok(view.includes(text),text);
});
test('score entry does not claim lowest golfer score alone counts',()=>{
 assert.ok(view.includes('EVERY GOLFER COUNTS'));
 assert.ok(view.includes('Individual Cup points count toward the team total'));
 for(const old of ['LOW SCORE COUNTS','LOW TEAM SCORE','Best tee shot, then everyone plays their own ball.'])assert.ok(!view.includes(old),old);
});

const {points,summarize}=require('../shamble-points.js');
test('points follow eagle through double bogey across par 3, 4 and 5',()=>{
 for(const par of [3,4,5])for(const [relative,expected] of [[-2,5],[-1,4],[0,3],[1,2],[2,1]]){
  if(par+relative>=1)assert.equal(points(par+relative,par),expected);
 }
});
for(const count of [22,23,24]){
 test(`${count} golfers: individual points sum across both teams for mixed pars`,()=>{
  const golfers=Array.from({length:count},(_,i)=>({name:`Golfer ${i}`,team:i%2,participating:true}));
  const teams=[{roster:[]},{roster:[]}];
  golfers.forEach((g,i)=>teams[g.team].roster.push(i));
  const pars=Array.from({length:18},(_,i)=>[3,4,5][i%3]);
  const rows=[];let expected=[0,0];
  for(let h=1;h<=18;h++)for(let i=0;i<count;i++){
   const score=pars[h-1]+(i%3)-1;
   rows.push({golfer_index:i,team_index:i%2,hole:h,score});
   expected[i%2]+=points(score,pars[h-1]);
  }
  const result=summarize({golfers,teams},rows,pars,null);
  assert.equal(result.completeHoles,18);
  assert.deepEqual(result.totals.map(t=>t.rawPoints),expected);
  assert.deepEqual(result.gatorBonus,[0,0]);
  assert.equal(result.players.reduce((sum,p)=>sum+p.points,0),expected[0]+expected[1]);
 });
}

for(const count of [22,23,24]){
 test(`${count} golfers: Gator Hole compares average golfer points, not roster size`,()=>{
  const golfers=Array.from({length:count},(_,i)=>({name:`Golfer ${i}`,team:i<12?0:1,participating:true}));
  const teams=[{roster:Array.from({length:12},(_,i)=>i)},{roster:Array.from({length:count-12},(_,i)=>12+i)}];
  const pars=Array(18).fill(4);
  const rows=[];
  for(let h=1;h<=18;h++)for(let i=0;i<count;i++)rows.push({golfer_index:i,team_index:i<12?0:1,hole:h,score:h===7?(i<12?4:3):4});
  const result=summarize({golfers,teams},rows,pars,7);
  assert.equal(result.completeHoles,18);
  assert.deepEqual(result.gatorBonus,[0,10]);
  assert.equal(result.totals[0].rawPoints,12*18*3);
  assert.equal(result.totals[1].rawPoints,(count-12)*(17*3+4));
  assert.equal(result.totals[1].pts,result.totals[1].rawPoints+10);
 });
}
test('Gator Hole tie splits ten points equally after both teams finish',()=>{
 const golfers=Array.from({length:23},(_,i)=>({name:`Golfer ${i}`,team:i<12?0:1,participating:true}));
 const teams=[{roster:Array.from({length:12},(_,i)=>i)},{roster:Array.from({length:11},(_,i)=>12+i)}];
 const pars=Array(18).fill(4);
 const rows=golfers.map((g,i)=>({golfer_index:i,team_index:g.team,hole:7,score:4}));
 let result=summarize({golfers,teams},rows,pars,7);
 assert.deepEqual(result.gatorBonus,[5,5]);
 result=summarize({golfers,teams},rows.slice(1),pars,7);
 assert.deepEqual(result.gatorBonus,[0,0]);
});

test('active points-entry hint matches par-specific format and individual scoring',()=>{
 const start=html.indexOf('function renderPointsEntry('),end=html.indexOf('function renderPointsExtras(',start);
 assert.ok(start>=0&&end>start,'Active points-entry renderer missing');
 const view=html.slice(start,end);
 for(const text of ['Par 3: own ball tee-to-cup','Par 4: best drive, then own ball','Par 5: best first two shots, then own ball','Every golfer earns points'])assert.ok(view.includes(text),text);
 assert.ok(!view.includes('Best team tee shot, then play your own ball.'),'Old misleading instruction remains');
});
