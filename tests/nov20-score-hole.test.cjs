const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','scoring.html'),'utf8');
function functionBody(start,end){const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a,'score-save function boundaries found');return html.slice(a,b)}
test('team score save captures selected hole before asynchronous writes',()=>{
 const body=functionBody('async function saveScore(teamIndex,val){','\nasync function loadBase(){');
 assert.match(body,/const scoreHole=hole;/);
 assert.match(body,/\.eq\("hole",scoreHole\)/);
 assert.match(body,/team_index:teamIndex,hole:scoreHole,score/);
 assert.doesNotMatch(body,/\.eq\("hole",hole\)/);
});

for(const [name,start,end] of [
 ['individual shamble','async function savePlayerShambleScore(teamIndex,golferIndex,val){','\nfunction renderPairScoring('],
 ['split pair','async function savePairScore(teamIndex,pairIndex,val){','\nfunction renderScoring(']
]){
 test(name+' saves and recomputes the original hole',()=>{
  const body=functionBody(start,end);
  assert.match(body,/const scoreHole=hole;/);
  assert.match(body,/\.eq\("hole",scoreHole\)/);
  assert.match(body,/hole:scoreHole/);
  assert.match(body,/Number\(x\.hole\)===scoreHole/);
  assert.doesNotMatch(body,/\.eq\("hole",hole\)/);
  assert.doesNotMatch(body,/Number\(x\.hole\)===hole/);
 });
}
