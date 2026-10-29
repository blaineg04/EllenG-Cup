'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../../db/patches/20261028_shamble_dynamic_draft_policies_REVIEW_ONLY.sql'),'utf8');
test('Shamble review-only policy replacement uses event-linked draft for all writes',()=>{
 for(const action of ['insert','update','delete']){
  const policy='shamble_team_'+action;
  const begin=sql.indexOf('CREATE POLICY '+policy+' ');
  assert.ok(begin>=0,policy);
  const end=sql.indexOf('DROP POLICY',begin+1);
  const body=sql.slice(begin,end<0?sql.length:end);
  assert.match(body,/JOIN public\.elleng_drafts d ON d\.id=t\.draft_id/);
  assert.match(body,/t\.id=elleng_player_hole_scores\.tournament_id/);
  assert.match(body,/c\.draft_id=t\.draft_id/);
  assert.match(body,/c\.team_index=elleng_player_hole_scores\.team_index/);
  assert.match(body,/auth\.uid\(\)/);
 }
 assert.doesNotMatch(sql,/draft_id\s*=\s*'elleng-cup'/);
 assert.match(sql,/DO NOT APPLY to hosted EllenG/);
});
