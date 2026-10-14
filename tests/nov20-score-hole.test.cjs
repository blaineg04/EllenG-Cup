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

test('split-pair verification recomputes from the final database reload',()=>{
 const body=functionBody('async function savePairScore(teamIndex,pairIndex,val){','\nfunction renderScoring(');
 assert.match(body,/const verifiedA=pairScores\.find/);
 assert.match(body,/const verifiedB=pairScores\.find/);
 assert.match(body,/Number\(verifiedA\.score\)\+Number\(verifiedB\.score\)/);
 assert.ok(body.lastIndexOf('await loadScores();')<body.indexOf('const verifiedA='));
});

test('failed score reload cannot publish a partial snapshot',()=>{
 const body=functionBody('async function loadScores(){','\nfunction teamOptions(');
 assert.match(body,/let nextPlayerScores=\[\],nextPairScores=\[\]/);
 assert.match(body,/if\(pe\)throw pe;if\(pairError\)throw pairError/);
 assert.match(body,/scores=data\|\|\[\];playerScores=nextPlayerScores;pairScores=nextPairScores/);
 assert.ok(body.indexOf('if(pe)throw pe')<body.indexOf('scores=data||[]'));
});

test('live score subscription reports disconnections and failed reloads',()=>{
 const body=functionBody('function subscribeLive(){','\nfunction setMobileNavVisible(');
 assert.match(body,/liveChannel\.subscribe\(status=>/);
 assert.match(body,/status==="SUBSCRIBED"/);
 assert.match(body,/status==="CHANNEL_ERROR"\|\|status==="TIMED_OUT"\|\|status==="CLOSED"/);
 assert.match(body,/setSyncStatus\("error","Live updates disconnected/);
 assert.match(body,/setSyncStatus\("error","Live scores need refresh"\)/);
});

test('network recovery reloads scores before restoring realtime and offline queue',()=>{
 const body=functionBody('window.addEventListener("online",async()=>{','\nwindow.addEventListener("offline",renderOfflineState)');
 assert.match(body,/await loadScores\(\)/);
 assert.match(body,/renderAll\(\)/);
 assert.match(body,/subscribeLive\(\)/);
 assert.match(body,/await flushOfflineScores\(\)/);
 assert.ok(body.indexOf('await loadScores()')<body.indexOf('subscribeLive()'));
 assert.ok(body.indexOf('subscribeLive()')<body.indexOf('await flushOfflineScores()'));
});

test('offline replay is paused without server-side conflict checks',()=>{
 const body=functionBody('async function flushOfflineScores(){','\nfunction renderTeams(');
 assert.match(body,/automatic replay paused/);
 assert.match(body,/return;/);
 assert.doesNotMatch(body,/db\.functions\.invoke\("golfer-handicap"/);
});
test('offline save copy does not promise automatic synchronization',()=>{
 const body=functionBody('async function saveSelfScore(clear=false){','\nasync function resetGolferPin(');
 assert.match(body,/offline score needs review after reconnecting/);
 assert.doesNotMatch(body,/it will sync automatically/);
});

test('offline queue status requires review and never claims automatic replay',()=>{
 const body=functionBody('function renderOfflineState(){','\nfunction renderTeams(');
 assert.match(body,/need review before submission/);
 assert.match(body,/stored locally/);
 assert.match(body,/automatic replay paused/);
 assert.doesNotMatch(body,/waiting to sync/);
 assert.doesNotMatch(body,/db\.functions\.invoke/);
 assert.doesNotMatch(body,/setOfflineQueue\(keep\)/);
});

test('offline review displays local scores without uploading or deleting them',()=>{
 const body=functionBody('function reviewOfflineScores(){','\nfunction queueOfflineScore(');
 assert.match(body,/offlineQueue\(\)/);
 assert.match(body,/item\.hole/);
 assert.match(body,/item\.score/);
 assert.match(body,/item\.queued_at/);
 assert.match(body,/NOT submitted/);
 assert.doesNotMatch(body,/db\.functions\.invoke|localStorage\.removeItem/);
 assert.match(body,/window\.confirm\(/);
 assert.match(body,/JSON\.stringify\(current\)!==JSON\.stringify\(entries\)/);
 assert.match(body,/setOfflineQueue\(\[\]\)/);
});
test('offline review banner supports click and keyboard',()=>{
 const body=functionBody('if($("offlineBanner")){','\nif("serviceWorker" in navigator)');
 assert.match(body,/addEventListener\("click",reviewOfflineScores\)/);
 assert.match(body,/e\.key==="Enter"\|\|e\.key===" "/);
});

test('personal score save reports success only after completed server and reload work',()=>{
 const body=functionBody('async function saveSelfScore(clear=false){','\nasync function resetGolferPin(');
 assert.match(body,/let saveSucceeded=false/);
 assert.match(body,/await loadBase\(\);await loadScores\(\);renderAll\(\);\s*saveSucceeded=true/);
 assert.match(body,/if\(saveSucceeded\)setSyncStatus\("saved","Saved ✓"\)/);
 assert.doesNotMatch(body,/!String\(msg\.textContent\|\|""\)/);
});

test('offline review alerts use real newline escape sequences',()=>{
 const body=functionBody('function reviewOfflineScores(){','\nfunction queueOfflineScore(');
 assert.match(body,/lines\.join\("\\n"\)/);
 assert.doesNotMatch(body,/lines\.join\("\\\\n"\)/);
 assert.match(body,/window\.confirm\(/);
});

test('offline queue replaces repeated local entries for the same event and hole',()=>{
 const body=functionBody('function queueOfflineScore(payload){','\nasync function flushOfflineScores(');
 assert.match(body,/payload\.tournament_id/);
 assert.match(body,/payload\.draft_id/);
 assert.match(body,/payload\.hole/);
 assert.match(body,/q\.filter\(/);
 assert.match(body,/remaining\.push\(/);
 assert.match(body,/setOfflineQueue\(remaining\)/);
});

test('offline queue is isolated by authenticated user id',()=>{
 const body=functionBody('function offlineQueueKey(){','\nfunction legacyOfflineQueueCount(');
 assert.match(body,/user\?\.id/);
 assert.match(body,/if\(!user\)return\[\]/);
 assert.match(body,/localStorage\.getItem\(offlineQueueKey\(\)\)/);
 assert.match(body,/localStorage\.setItem\(offlineQueueKey\(\),JSON\.stringify\(q\)\)/);
 assert.doesNotMatch(body,/localStorage\.getItem\(OFFLINE_SCORE_KEY\)/);
});

test('legacy offline scores are flagged without being reassigned or deleted',()=>{
 const body=functionBody('function legacyOfflineQueueCount(){','\nfunction queueOfflineScore(');
 assert.match(body,/localStorage\.getItem\(OFFLINE_SCORE_KEY\)/);
 assert.match(body,/legacyOfflineQueueCount\(\)/);
 assert.match(body,/commissioner review/);
 assert.doesNotMatch(body,/localStorage\.removeItem\(OFFLINE_SCORE_KEY\)/);
 assert.doesNotMatch(body,/setOfflineQueue\(legacy/);
});

test('clearing local offline entries never reports a successful server sync',()=>{
 const body=functionBody('function reviewOfflineScores(){','\nfunction queueOfflineScore(');
 assert.match(body,/setSyncStatus\("saving","Offline entries cleared locally/);
 assert.doesNotMatch(body,/setSyncStatus\("saved"/);
});

test('offline review blocks clearing after a signed-in account switch',()=>{
 const body=functionBody('function reviewOfflineScores(){','\nfunction queueOfflineScore(');
 assert.match(body,/const reviewAccountId=user\?\.id/);
 assert.match(body,/if\(!reviewAccountId\)/);
 assert.match(body,/if\(user\?\.id!==reviewAccountId\)/);
 assert.ok(body.indexOf('user?.id!==reviewAccountId')<body.indexOf('setOfflineQueue([])'));
});

test('reviewed offline entries are archived before pending queue is cleared',()=>{
 const body=functionBody('function reviewOfflineScores(){','\nfunction queueOfflineScore(');
 assert.match(body,/offlineQueueKey\(\)\+":review_archive"/);
 assert.match(body,/localStorage\.setItem\(archiveKey,JSON\.stringify\(archive\)\)/);
 assert.match(body,/reviewed_at:new Date\(\)\.toISOString\(\),entries/);
 assert.ok(body.indexOf('localStorage.setItem(archiveKey')<body.indexOf('setOfflineQueue([])'));
 assert.match(body,/Pending entries were not cleared/);
});

test('last reviewed offline archive can be inspected without resubmitting',()=>{
 const body=functionBody('function reviewOfflineScores(){','\nfunction queueOfflineScore(');
 assert.match(body,/offlineQueueKey\(\)\+":review_archive"/);
 assert.match(body,/archive\[archive\.length-1\]/);
 assert.match(body,/Archived local review/);
 assert.doesNotMatch(body,/db\.functions\.invoke/);
});

test('archived offline review remains reachable when pending queue is empty',()=>{
 const body=functionBody('function renderOfflineState(){','\nfunction reviewOfflineScores(');
 assert.match(body,/hasArchive=Array\.isArray\(archived\)&&archived\.length>0/);
 assert.match(body,/&&legacy===0&&!hasArchive/);
 assert.match(body,/View last offline-score review archive/);
});
