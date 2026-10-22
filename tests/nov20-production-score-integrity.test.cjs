// Release-gate regression tests. Run with: node --test tests/nov20-production-score-integrity.test.cjs
// These intentionally fail on the unpatched production baseline.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','scoring.html'),'utf8');
function pendingHoleSave(kind,clear=false){
 const start=html.indexOf('async function '+(kind==='shamble'?'savePlayerShambleScore':'savePairScore')+'(');
 const end=html.indexOf(kind==='shamble'?'function renderPairScoring(':'function renderScoring(',start);
 let release;const pending=new Promise(resolve=>{release=resolve});let first=true;const writes=[];
 const finish=()=>{if(first){first=false;return pending}return Promise.resolve({error:null})};
 const db={from(table){return {upsert(row){writes.push({table,hole:row.hole,score:row.score,operation:'upsert'});return finish()},delete(){const filters={};return {eq(key,value){filters[key]=value;return this},then(resolve,reject){writes.push({table,hole:filters.hole,operation:'delete'});return finish().then(resolve,reject)}}}}}};
 const initial=kind==='shamble'?10:1;
 const rows=[];for(const h of [initial,initial+1])for(let i=0;i<(kind==='shamble'?4:2);i++)if(!(clear&&h===initial&&i===0))rows.push({team_index:0,hole:h,golfer_index:i,pair_index:i,score:h===initial?i+4:i+8});
 const context={hole:initial,db,TOURNAMENT_ID:'test-tournament',user:{id:'test-user'},canEditTeam:()=>true,isSplitPair:()=>true,beginScoreSave:()=>true,endScoreSave(){},$:()=>({textContent:''}),loadScores:async()=>{},teamRosterGolfers:()=>[0,1,2,3].map(index=>({index})),playerScores:rows,pairScores:rows,renderAll(){}};
 vm.runInNewContext(html.slice(start,end),context);
 return {context,writes,initial,release:()=>release({error:null}),run:()=>kind==='shamble'?context.savePlayerShambleScore(0,0,clear?'':'4'):context.savePairScore(0,0,clear?'':'4')};
}
for(const kind of ['shamble','split-pair'])for(const clear of [false,true])test(`${kind} ${clear?'clear':'save'} keeps the original hole after navigation during a pending request`,async()=>{
 const page=pendingHoleSave(kind,clear);const operation=page.run();await Promise.resolve();page.context.hole=page.initial+1;page.release();await operation;
 assert.equal(page.writes.length,2);assert.ok(page.writes.every(write=>write.hole===page.initial),JSON.stringify(page.writes));
 const team=page.writes[1];assert.equal(team.table,'elleng_team_scores');assert.equal(team.operation,clear?'delete':'upsert');if(!clear)assert.equal(team.score,kind==='shamble'?4:9);
});
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
  for(const value of ['',' ','  ',null,undefined,false,true,0,-1,1.5,'oops',Number.MAX_SAFE_INTEGER+1,splitPair?41:21]){
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
  finalCargoBonus:()=>9,
  isFinalCargoTeam:i=>i===0,
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
 for(const h of [0,19,-1,1.5,NaN,null,undefined,'','  ',false,true]){
  assert.deepEqual(Array.from(ctx.pointsForHole(h)),[null,null],String(h));
 }
 assert.deepEqual(Array.from(ctx.pointsForHole('19')),[null,null]);
});

test('Final Cargo bonus stays finite and honors an explicit zero',()=>{
 const start=html.indexOf('function finalCargoBonus(){');
 const end=html.indexOf('function totals(){',start);
 assert.ok(start>=0&&end>start);
 const ctx={tournament:{final_cargo_points:0}};
 vm.runInNewContext(html.slice(start,end),ctx);
 assert.equal(ctx.finalCargoBonus(),0);
 for(const bad of ['invalid','Infinity',-4,'',null,undefined,true,false,1.5,Number.MAX_SAFE_INTEGER+1]){
  ctx.tournament.final_cargo_points=bad;
  assert.equal(ctx.finalCargoBonus(),6,String(bad));
 }
 ctx.tournament.final_cargo_points=9;
 assert.equal(ctx.finalCargoBonus(),9);
});

test('unset Gator Hole always uses standard points',()=>{
 const start=html.indexOf('function normalPoints(values){');
 const end=html.indexOf('function finalCargoBonus(){',start);
 assert.ok(start>=0&&end>start);
 const ctx={
  teams:[{name:'Gators'},{name:'Herons'}],
  scores:[{team_index:0,hole:4,score:3},{team_index:1,hole:4,score:5}],
  tournament:{gator_hole:null},
  isSplitPair:()=>false,
  validTeamScore:score=>Number.isInteger(Number(score))&&Number(score)>=1&&Number(score)<=20
 };
 vm.runInNewContext(html.slice(start,end),ctx);
 for(const unset of [null,undefined,'','  ',true,false]){
  ctx.tournament.gator_hole=unset;
  assert.deepEqual(Array.from(ctx.pointsForHole(4)),[2,1],String(unset));
 }
 ctx.tournament.gator_hole=4;
 assert.deepEqual(Array.from(ctx.pointsForHole(4)),[12,0]);
});

test('broadcast ignores empty and boolean team identifiers',()=>{
 const start=html.indexOf('function latestTournamentMoment(){');
 const end=html.indexOf('function renderBroadcast(){',start);
 const ctx={
  teams:[{name:'Gators'},{name:'Herons'}],
  scores:[{team_index:null,hole:18,score:3},{team_index:false,hole:17,score:3},{team_index:'',hole:16,score:3},{team_index:1,hole:4,score:4}],
  validTeamScore:score=>Number.isInteger(Number(score))&&Number(score)>=1&&Number(score)<=20,
  relativeGolf:()=>({rel:'0',label:'Par'}),
  parForHole:()=>4
 };
 vm.runInNewContext(html.slice(start,end),ctx);
 assert.match(ctx.latestTournamentMoment(),/Herons.*Hole 4/);
});

test('golf result labels reject fractional and unsafe strokes',()=>{
 const start=html.indexOf('function relativeGolf(score,par){');
 const end=html.indexOf('function pointScaleText(){',start);
 assert.ok(start>=0&&end>start);
 const ctx={};
 vm.runInNewContext(html.slice(start,end),ctx);
 for(const invalid of [1.5,'3.5',Number.MAX_SAFE_INTEGER+1,NaN,Infinity]){
  const result=ctx.relativeGolf(invalid,4);
  assert.equal(result.rel,'—',String(invalid));
  assert.equal(result.label,'',String(invalid));
 }
 assert.equal(ctx.relativeGolf(4,4).label,'Par');
 assert.equal(ctx.relativeGolf('3',4).label,'Birdie');
});

test('Final Cargo rejects blank, boolean and fractional team assignments',()=>{
 const start=html.indexOf('function isFinalCargoTeam(i){');
 const end=html.indexOf('function totals(){',start);
 assert.ok(start>=0&&end>start);
 const ctx={teams:[{name:'Gators'},{name:'Herons'}],tournament:{final_cargo_team:0}};
 vm.runInNewContext(html.slice(start,end),ctx);
 assert.equal(ctx.isFinalCargoTeam(0),true);
 assert.equal(ctx.isFinalCargoTeam(1),false);
 for(const bad of [null,undefined,'','  ',true,false,0.5,-1,2,'invalid']){
  ctx.tournament.final_cargo_team=bad;
  assert.equal(ctx.isFinalCargoTeam(0),false,String(bad));
  assert.equal(ctx.isFinalCargoTeam(1),false,String(bad));
 }
 ctx.tournament.final_cargo_team='1';
 assert.equal(ctx.isFinalCargoTeam(1),true);
});

test('golf labels require a valid par-three, par-four or par-five hole',()=>{
 const start=html.indexOf('function relativeGolf(score,par){');
 const end=html.indexOf('function pointScaleText(){',start);
 const ctx={};
 vm.runInNewContext(html.slice(start,end),ctx);
 for(const par of [null,undefined,'','  ',true,false,0,2,6,4.5,NaN,Infinity]){
  const result=ctx.relativeGolf(4,par);
  assert.equal(result.rel,'—',String(par));
  assert.equal(result.label,'',String(par));
 }
 for(const par of [3,4,5,'4'])assert.notEqual(ctx.relativeGolf(4,par).label,'');
});

test('golf result label distinguishes albatross from four under par',()=>{
 const start=html.indexOf('function relativeGolf(score,par){');
 const end=html.indexOf('function pointScaleText(){',start);
 const ctx={};
 vm.runInNewContext(html.slice(start,end),ctx);
 assert.equal(ctx.relativeGolf(2,5).label,'Albatross');
 assert.equal(ctx.relativeGolf(1,5).label,'Hole in One');
 assert.equal(ctx.relativeGolf(2,4).label,'Eagle');
 assert.equal(ctx.relativeGolf(3,4).label,'Birdie');
});

test('golf result labels reject stroke totals beyond the supported score ceiling',()=>{
 const start=html.indexOf('function relativeGolf(score,par){');
 const end=html.indexOf('function pointScaleText(){',start);
 const ctx={};
 vm.runInNewContext(html.slice(start,end),ctx);
 for(const score of [41,'41',100,Number.MAX_SAFE_INTEGER]){
  const result=ctx.relativeGolf(score,4);
  assert.equal(result.rel,'—');
  assert.equal(result.label,'');
 }
 assert.equal(ctx.relativeGolf(40,4).rel,'+36');
});

test('mobile and desktop layouts include responsive overflow containment',()=>{
 const start=html.indexOf('<style id="responsive-overlap-guard-20261021">');
 const end=html.indexOf('</style>',start);
 assert.ok(start>=0&&end>start,'Missing responsive overlap stylesheet');
 const css=html.slice(start,end);
 for(const selector of ['.leader-row > *','.score-grid > *','.player-admin-row > *','.broadcast-row > *','.shamble-player > *']){
  assert.ok(css.includes(selector),selector);
 }
 assert.match(css,/min-width:0/);
 assert.match(css,/@media\(max-width:650px\)/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
});

test('responsive overlap guards load after all legacy style overrides',()=>{
 const marker='<style id="responsive-overlap-guard-20261021">';
 const pos=html.indexOf(marker);
 assert.ok(pos>=0);
 assert.equal(html.indexOf(marker,pos+1),-1,'Duplicate responsive stylesheet');
 assert.equal(html.slice(pos).match(/<style\b/g)?.length,1,'Later style may override layout guards');
 assert.ok(html.slice(pos).trimEnd().endsWith('</style>'),'Responsive rules must be the final stylesheet');
});

test('narrow-screen commissioner and text layouts remain bounded',()=>{
 const start=html.indexOf('<style id="responsive-overlap-guard-20261021">');
 const css=html.slice(start);
 assert.ok(css.includes('.admin-stats,.admin-jumps{grid-template-columns:repeat(2,minmax(0,1fr))}'));
 assert.ok(css.includes('.brand h1,.brand p'));
 assert.ok(css.includes('overflow-wrap:anywhere'));
 assert.ok(css.includes('.trash-compose{grid-template-columns:minmax(0,1fr)}'));
 assert.ok(css.includes('.score-grid input,.score-grid select'));
 assert.ok(css.includes('max-width:100%;min-width:0'));
});

test('populated featured matchup renders tied fractional points without a startup exception',()=>{
 const element={innerHTML:''};
 const ctx={$:()=>element,esc:s=>s,teams:[{name:'Bayou'},{name:'Herons'}],closestTeams:()=>({a:{team:0,pts:12.5},b:{team:1,pts:11},diff:1.5})};
 const format=html.match(/function fmt\(n\)\{[^\n]+\}/);
 if(format)vm.runInNewContext(format[0],ctx);
 const start=html.indexOf('function renderFeaturedMatchup(){');
 const end=html.indexOf('function renderPlayerSpotlight(){',start);
 vm.runInNewContext(html.slice(start,end),ctx);
 ctx.renderFeaturedMatchup();
 assert.match(element.innerHTML,/12\.5–11 Cup points/);
 assert.match(element.innerHTML,/1\.5 points apart/);
});

