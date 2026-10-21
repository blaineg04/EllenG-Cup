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
