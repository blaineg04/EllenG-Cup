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

test('hole navigation is blocked during an in-flight score save',()=>{
 const body=functionBody('function renderHolebar(){','\nfunction canEditTeam(');
 assert.match(body,/if\(scoreSaveBusy\)/);
 assert.match(body,/score to finish saving/);
 assert.ok(body.indexOf('if(scoreSaveBusy)')<body.indexOf('hole=Number(b.dataset.hole)'));
});

test('team save confirms the persisted value before reporting Saved',()=>{
 const body=functionBody('async function saveScore(teamIndex,val){','\nasync function loadBase(){');
 assert.match(body,/await loadScores\(\);/);
 assert.match(body,/const persisted=scores\.find/);
 assert.match(body,/Number\(persisted\?\.score\)!==score/);
 assert.match(body,/score===null \? persisted!=null/);
 assert.ok(body.indexOf('const persisted=scores.find')<body.indexOf('el.textContent="Saved."'));
});

for(const [name,start,end] of [
 ['shamble','async function savePlayerShambleScore(teamIndex,golferIndex,val){','\nfunction renderPairScoring('],
 ['split-pair','async function savePairScore(teamIndex,pairIndex,val){','\nfunction renderScoring(']
]){
 test(name+' verifies the saved entry and derived team total',()=>{
  const body=functionBody(start,end);
  assert.match(body,/team_index:teamIndex,hole:scoreHole,score:/);
  assert.match(body,/const savedEntry=/);
  assert.match(body,/const savedTeamScore=scores\.find/);
  assert.match(body,/const expectedTeamScore=/);
  assert.ok(body.indexOf('const savedTeamScore=')<body.indexOf('el.textContent="Saved.'));
 });
}

test('shamble verification recalculates from scores reloaded after team write',()=>{
 const body=functionBody('async function savePlayerShambleScore(teamIndex,golferIndex,val){','\nfunction renderPairScoring(');
 assert.match(body,/const verifiedRows=roster\.map\(g=>playerScores\.find/);
 assert.match(body,/verifiedRows\.every\(Boolean\)/);
 assert.match(body,/verifiedRows\.map\(x=>Number\(x\.score\)\)/);
 assert.ok(body.lastIndexOf('await loadScores();')<body.indexOf('const verifiedRows='));
});
