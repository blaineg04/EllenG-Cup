// Guardrails for the deployed v12 function source; these do not replace authenticated integration tests.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/golfer-handicap/index.ts'),'utf8');
const update=source.slice(source.indexOf('if(action==="update_score")'));
test('individual scoring accepts holes 1–18 and rejects other hole numbers',()=>{
 assert.match(update,/hole<1\|\|hole>18/);
 assert.match(update,/Number\.isInteger\(hole\)/);
});
test('individual scorer is bound to authenticated and linked golfer',()=>{
 assert.match(source,/userClient\.auth\.getUser\(\)/);
 assert.match(source,/eq\("user_id",user\.id\)/);
 assert.match(update,/ownGolfer\(draft\)/);
 assert.match(update,/roster\.includes\(golferIndex\)/);
 assert.match(source,/String\(data\.draft_id\|\|""\)!==draftId/);
});
test('individual score saves are isolated by golfer and do not derive low-ball team score',()=>{
 const standard=update.slice(update.indexOf('// For the 18-hole shamble'));
 assert.match(standard,/elleng_player_hole_scores/);
 assert.match(standard,/golfer_index:golferIndex/);
 assert.match(standard,/onConflict:"tournament_id,hole,team_index,golfer_index"/);
 assert.doesNotMatch(standard,/elleng_team_scores/);
});
test('invalid strokes and closed tournaments are rejected before writing scores',()=>{
 assert.match(update,/n<1\|\|n>20/);
 assert.match(update,/Number\.isInteger\(n\)/);
 assert.match(source,/\["setup","live"\]\.includes/);
});
