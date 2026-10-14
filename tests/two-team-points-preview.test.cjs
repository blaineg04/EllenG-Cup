const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','two-team-points-preview.html'),'utf8');
test('preview loads additive scoring engine without database dependencies',()=>{
 assert.match(html,/<script src="two-team-points\.js"><\/script>/);
 assert.doesNotMatch(html,/supabase\.createClient|https:\/\/[^\s"'<>]*supabase|fetch\s*\(/i);
});
test('preview exposes team, golfer, hole, par and pickup inputs',()=>{
 for(const id of ['count','team','player','hole','par','strokes','pickup','save','scores','a','b'])
  assert.match(html,new RegExp('id="'+id+'"'));
});
test('preview uses score upsert and leaderboard instead of legacy scoring',()=>{
 assert.match(html,/engine\.upsertHoleEntry\(/);
 assert.match(html,/engine\.leaderboard\(/);
 assert.match(html,/engine\.scoreHole\(/);
});

test('commissioner development setup links preview without replacing existing formats',()=>{
 const scoring=fs.readFileSync(path.join(__dirname,'..','scoring.html'),'utf8');
 assert.match(scoring,/href="two-team-points-preview\.html"/);
 assert.match(scoring,/<option value="standard">/);
 assert.match(scoring,/<option value="split_pair">/);
 assert.doesNotMatch(scoring,/<option value="two_team_individual_points">/);
});
