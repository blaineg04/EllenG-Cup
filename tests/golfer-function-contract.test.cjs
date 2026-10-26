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

test('commissioner-only actions verify ownership before returning',()=>{
 assert.match(source,/async function requireCommissioner\(\)/);
 assert.match(source,/draft\.owner_id!==user\.id/);
 assert.match(source,/if\(action==="reset_pin"\|\|action==="issue_activation"\)/);
 assert.match(source,/const draft=await requireCommissioner\(\)/);
});
test('player handicap edits require account linkage and an atomic verified save',()=>{
 const handicap=source.slice(source.indexOf('if(action==="update_handicap")'),source.indexOf('if(action==="update_score")'));
 assert.match(handicap,/ownGolfer\(draft\)/);
 assert.match(handicap,/elleng_patch_golfer_atomic/);
 assert.match(handicap,/savedHcp!==handicap\|\|savedBand!==band/);
});
test('score submissions require active tournament and matching draft association',()=>{
 assert.match(update,/await activeTournament\(teamIndex\)/);
 assert.match(source,/String\(data\.draft_id\|\|""\)!==draftId/);
 assert.match(source,/teamIndex>=count/);
});

test('roster parsing rejects null, empty, negative and fractional golfer IDs',()=>{
 const vm=require('node:vm');
 const start=source.indexOf('function rosterIndexes(');
 const end=source.indexOf('\n\nDeno.serve(',start);
 assert.ok(start>=0&&end>start,'Cannot locate roster helper');
 const ctx={};
 vm.runInNewContext(source.slice(start,end),ctx);
 const result=Array.from(ctx.rosterIndexes({roster:[0,1,{golferIndex:2},{golferIndex:"3"},{golferIndex:null},{golferIndex:""},{golferIndex:-1},{golferIndex:1.5},{golferIndex:true},{golferIndex:"nope"}]}));
 assert.deepEqual(result,[0,1,2,3]);
});
