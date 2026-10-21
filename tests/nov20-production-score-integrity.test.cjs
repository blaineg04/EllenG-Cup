// Release-gate regression tests. Run with: node --test tests/nov20-production-score-integrity.test.cjs
// These intentionally fail on the unpatched production baseline.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','scoring.html'),'utf8');
const from=html.indexOf('function normalPoints(values){');
const to=html.indexOf('function totals(){',from);
assert.ok(from>=0&&to>from,'Unable to locate production points functions');
function points(scores,{gator=false,splitPair=false}={}){
 const ctx={
  teams:scores.map((_,i)=>({name:'Team '+(i+1)})),
  scores:scores.map((score,i)=>({team_index:i,hole:4,score})),
  tournament:{gator_hole:gator?4:17},
  isSplitPair:()=>splitPair
 };
 ctx.validTeamScore=score=>score!==null&&score!==undefined&&typeof score!=='boolean'&&String(score).trim()!==''&&Number.isInteger(Number(score))&&Number(score)>=1&&Number(score)<=(ctx.isSplitPair()?40:20);
 vm.runInNewContext(html.slice(from,to),ctx);
 return Array.from(ctx.pointsForHole(4));
}
test('Gator Hole cannot award points when any team score is empty',()=>{
 assert.deepEqual(points([4,'',6],{gator:true}),[null,null,null]);
 assert.deepEqual(points([4,4,5],{gator:true}),[6,6,0]);
});
test('standard score limits do not reject valid combined Split-Pair scores',()=>{
 assert.deepEqual(points([24,25],{splitPair:true}),[2,1]);
 assert.deepEqual(points([24,25]),[null,null]);
 assert.deepEqual(points([41,24],{splitPair:true}),[null,null]);
});

test('scoring works for flexible team counts without assuming nine teams',()=>{
 for(const n of [2,3,4,6,9,12]){
  const scores=Array.from({length:n},(_,i)=>i+3);
  assert.deepEqual(points(scores),Array.from({length:n},(_,i)=>n-i));
 }
});
test('standard tied teams share their rank points',()=>{
 assert.deepEqual(points([4,4,5,6]),[3.5,3.5,2,1]);
 assert.deepEqual(points([4,5,5,6]),[4,2.5,2.5,1]);
 assert.deepEqual(points([4,4,4]),[2,2,2]);
});
test('Gator Hole distributes twelve points across all tied winners',()=>{
 assert.deepEqual(points([3,3,3,4],{gator:true}),[4,4,4,0]);
 assert.deepEqual(points([5,5],{gator:true}),[6,6]);
 assert.deepEqual(points([3,4,5,6,7,8],{gator:true}),[12,0,0,0,0,0]);
});
test('no leaderboard points until every team submits a valid score',()=>{
 for(const invalid of ['',null,undefined,0,-1,1.5,'abc',21]){
  assert.deepEqual(points([4,invalid,6]),[null,null,null],String(invalid));
 }
 assert.deepEqual(points([4,20,6]),[3,1,2]);
 assert.deepEqual(points([4,40,6],{splitPair:true}),[3,1,2]);
 assert.deepEqual(points([4,41,6],{splitPair:true}),[null,null,null]);
});

test('leaderboard thru ignores blank and invalid scores',()=>{
 const start=html.indexOf('function normalPoints(values){');
 const end=html.indexOf('function renderLiveHoleScores(){',start);
 assert.ok(end>start,'Unable to locate totals function');
 const ctx={
  teams:[{name:'One'},{name:'Two'}],
  scores:[{team_index:0,hole:1,score:4},{team_index:1,hole:1,score:5},{team_index:0,hole:2,score:''},{team_index:1,hole:2,score:0}],
  tournament:{gator_hole:18,final_cargo_team:null},
  isSplitPair:()=>false
 };
 ctx.validTeamScore=score=>score!==null&&score!==undefined&&typeof score!=='boolean'&&String(score).trim()!==''&&Number.isInteger(Number(score))&&Number(score)>=1&&Number(score)<=20;
 vm.runInNewContext(html.slice(start,end),ctx);
 let results=Array.from(ctx.totals());
 assert.equal(results[0].thru,1);
 assert.equal(results[1].thru,1);
 ctx.scores[2].score=4;ctx.scores[3].score=5;
 results=Array.from(ctx.totals());
 assert.equal(results[0].thru,2);
 assert.equal(results[1].thru,2);
});

test('live hole validation rejects empty and invalid scores across formats',()=>{
 const from=html.indexOf('function validTeamScore(score){');
 const to=html.indexOf('function pointsForHole(h){',from);
 assert.ok(from>=0&&to>from,'Missing shared score validator');
 for(const splitPair of [false,true]){
  const ctx={isSplitPair:()=>splitPair};
  vm.runInNewContext(html.slice(from,to),ctx);
  for(const value of ['',' ','  ',null,undefined,false,true,0,-1,1.5,'oops',splitPair?41:21]){
   assert.equal(ctx.validTeamScore(value),false,String(value));
  }
  assert.equal(ctx.validTeamScore(splitPair?40:20),true);
  assert.equal(ctx.validTeamScore(4),true);
 }
});

test('broadcast moment ignores invalid scores and malformed team or hole references',()=>{
 const start=html.indexOf('function latestTournamentMoment(){');
 const end=html.indexOf('function renderBroadcast(){',start);
 assert.ok(start>=0&&end>start,'Missing broadcast highlight function');
 const ctx={
  scores:[{hole:18,team_index:0,score:''},{hole:17,team_index:9,score:3},{hole:16,team_index:0,score:0},{hole:4,team_index:1,score:4}],
  teams:[{name:'Gators'},{name:'Herons'}],
  isSplitPair:()=>false,
  validTeamScore:score=>score!==null&&score!==undefined&&typeof score!=='boolean'&&String(score).trim()!==''&&Number.isInteger(Number(score))&&Number(score)>=1&&Number(score)<=20,
  relativeGolf:(score,par)=>({rel:String(score-par),label:'Par'}),
  parForHole:()=>4
 };
 vm.runInNewContext(html.slice(start,end),ctx);
 assert.match(ctx.latestTournamentMoment(),/Herons.*Hole 4/);
 ctx.scores=[];
 assert.equal(ctx.latestTournamentMoment(),'Waiting for the first score to be posted.');
});

test('leaderboard thru accepts numeric identifiers serialized as strings',()=>{
 const start=html.indexOf('function normalPoints(values){');
 const end=html.indexOf('function renderLiveHoleScores(){',start);
 const ctx={
  teams:[{name:'One'},{name:'Two'}],
  scores:[{team_index:'0',hole:'1',score:'4'},{team_index:'1',hole:'1',score:'5'},{team_index:'0',hole:'2',score:''}],
  tournament:{gator_hole:18,final_cargo_team:null},
  isSplitPair:()=>false,
  validTeamScore:score=>score!==null&&score!==undefined&&typeof score!=='boolean'&&String(score).trim()!==''&&Number.isInteger(Number(score))&&Number(score)>=1&&Number(score)<=20
 };
 vm.runInNewContext(html.slice(start,end),ctx);
 const results=Array.from(ctx.totals());
 assert.equal(results[0].thru,1);
 assert.equal(results[1].thru,1);
 assert.equal(results[0].pts,2);
 assert.equal(results[1].pts,1);
});

test('Final Cargo leaderboard badge uses configured bonus instead of fixed six',()=>{
 const start=html.indexOf('function renderLeaderboard(){');
 const end=html.indexOf('function trashTime(ts){',start);
 assert.ok(start>=0&&end>start,'Unable to locate leaderboard renderer');
 const board={innerHTML:'',dataset:{}};
 const ctx={
  teams:[{name:'Gators'},{name:'Herons'}],
  tournament:{final_cargo_team:0,final_cargo_points:9},
  totals:()=>[{team:0,pts:12,thru:18},{team:1,pts:4,thru:18}],
  pointScaleText:()=> '2–1',
  esc:x=>String(x),
  renderLiveHoleScores:()=>{},
  $:id=>id==='leaderboard'?board:null
 };
 vm.runInNewContext(html.slice(start,end),ctx);
 ctx.renderLeaderboard();
 assert.match(board.innerHTML,/\+9 Cargo/);
 assert.doesNotMatch(board.innerHTML,/\+6 Cargo/);
});

test('live hole scores accept string-serialized team and hole IDs',()=>{
 const start=html.indexOf('function renderLiveHoleScores(){');
 const end=html.indexOf('function scoreClass(rel){',start);
 assert.ok(start>=0&&end>start,'Unable to locate live hole renderer');
 const board={innerHTML:''};
 const ctx={
  teams:[{name:'Gators'},{name:'Herons'}],
  scores:[{team_index:'0',hole:'1',score:'4'},{team_index:'1',hole:'1',score:'5'}],
  tournament:{gator_revealed:false,gator_hole:18},
  validTeamScore:score=>score!==null&&score!==undefined&&String(score).trim()!==''&&Number.isInteger(Number(score))&&Number(score)>=1&&Number(score)<=20,
  parForHole:()=>4,
  relativeGolf:score=>({rel:String(Number(score)-4),label:'Par'}),
  esc:x=>String(x),
  $:()=>board
 };
 vm.runInNewContext(html.slice(start,end),ctx);
 ctx.renderLiveHoleScores();
 assert.match(board.innerHTML,/OFFICIAL/);
 assert.match(board.innerHTML,/Gators/);
 assert.match(board.innerHTML,/Herons/);
 assert.match(board.innerHTML,/Hole 1/);
});

test('live holes do not appear solely because of orphaned team scores',()=>{
 const start=html.indexOf('function renderLiveHoleScores(){');
 const end=html.indexOf('function scoreClass(rel){',start);
 const board={innerHTML:''};
 const ctx={
  teams:[{name:'Gators'},{name:'Herons'}],
  scores:[{team_index:99,hole:12,score:4},{team_index:-1,hole:10,score:4},{team_index:0,hole:2,score:4}],
  tournament:{gator_revealed:false,gator_hole:18},
  validTeamScore:score=>Number.isInteger(Number(score))&&Number(score)>=1&&Number(score)<=20,
  parForHole:()=>4,
  relativeGolf:()=>({rel:'0',label:'Par'}),
  esc:x=>String(x),
  $:()=>board
 };
 vm.runInNewContext(html.slice(start,end),ctx);
 ctx.renderLiveHoleScores();
 assert.match(board.innerHTML,/Hole 2/);
 assert.doesNotMatch(board.innerHTML,/Hole 12/);
 assert.doesNotMatch(board.innerHTML,/Hole 10/);
});

test('official scoring returns no results when there are no teams',()=>{
 assert.deepEqual(points([]),[]);
 assert.deepEqual(points([],{gator:true}),[]);
 assert.deepEqual(points([],{splitPair:true}),[]);
});

test('relative golf labels never treat blank, boolean or zero scores as strokes',()=>{
 const start=html.indexOf('function relativeGolf(score,par){');
 const end=html.indexOf('function pointScaleText(){',start);
 assert.ok(start>=0&&end>start);
 const ctx={};
 vm.runInNewContext(html.slice(start,end),ctx);
 for(const invalid of [null,undefined,'','   ',false,true,0,-2,'not a score']){
  assert.equal(ctx.relativeGolf(invalid,4).rel,'—',String(invalid));
 }
 assert.equal(ctx.relativeGolf(4,4).label,'Par');
 assert.equal(ctx.relativeGolf(3,4).label,'Birdie');
});

test('official points reject holes outside the playable 1–18 range',()=>{
 const start=html.indexOf('function normalPoints(values){');
 const end=html.indexOf('function totals(){',start);
 const ctx={
  teams:[{name:'Gators'},{name:'Herons'}],
  scores:[{team_index:0,hole:0,score:3},{team_index:1,hole:0,score:4},{team_index:0,hole:19,score:3},{team_index:1,hole:19,score:4}],
  tournament:{gator_hole:19},
  isSplitPair:()=>false,
  validTeamScore:score=>Number.isInteger(Number(score))&&Number(score)>=1&&Number(score)<=20
 };
 vm.runInNewContext(html.slice(start,end),ctx);
 for(const h of [0,19,-1,1.5,NaN]){
  assert.deepEqual(Array.from(ctx.pointsForHole(h)),[null,null],String(h));
 }
 assert.deepEqual(Array.from(ctx.pointsForHole('19')),[null,null]);
});
