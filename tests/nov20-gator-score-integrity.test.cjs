const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','scoring.html'),'utf8');
const from=html.indexOf('function normalPoints(values){');
const to=html.indexOf('function totals(){',from);
assert.ok(from>=0&&to>from,'scoring functions missing');
function points(values,gator=false,splitPair=false){
 const ctx={teams:values.map((_,i)=>({name:'Team '+(i+1)})),
 scores:values.filter((v)=>v!==undefined).map((v,i)=>({team_index:i,hole:4,score:v})),
 tournament:{gator_hole:gator?4:17},isSplitPair:()=>splitPair};
 vm.runInNewContext(html.slice(from,to),ctx);
 return Array.from(ctx.pointsForHole(4));
}
test('normal scoring waits for every team and rejects empty or invalid scores',()=>{
 assert.deepEqual(points([4,5,6]),[3,2,1]);
 for(const bad of [null,'',0,-1,21,'oops',2.5])
  assert.deepEqual(points([4,bad,6]),[null,null,null],String(bad));
});
test('Gator hole awards tied winners equal shares only after complete scores',()=>{
 assert.deepEqual(points([4,4,5],true),[6,6,0]);
 assert.deepEqual(points([4,5,6],true),[12,0,0]);
 assert.deepEqual(points([4,'',6],true),[null,null,null]);
});

test('Split-Pair totals of two valid pair scores can exceed 20 without disappearing from leaderboard',()=>{
 assert.deepEqual(points([24,25],false,true),[2,1]);
 assert.deepEqual(points([24,24],true,true),[6,6]);
 assert.deepEqual(points([40,39],false,true),[1,2]);
 assert.deepEqual(points([24,25]),[null,null],'standard format still rejects totals above 20');
 assert.deepEqual(points([41,24],false,true),[null,null],'invalid split-pair total blocks points');
});
