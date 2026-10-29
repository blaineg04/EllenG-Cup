'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('scoring.html','utf8');
const sql=fs.readFileSync('db/patches/20261029_commissioner_score_reset_rpc_REVIEW_ONLY.sql','utf8');
test('commissioner reset is one RPC, not three direct table deletes',()=>{
 const section=html.split('async function clearScoresOnly(){')[1].split('async function resetAllRsvps(){')[0];
 assert.match(section,/db\.rpc\("elleng_test_commissioner_clear_scores"/);
 assert.doesNotMatch(section,/db\.from\("elleng_(?:team_scores|player_hole_scores|pair_hole_scores)"\)/);
});
test('server reset checks auth and owner, locks tournament, and deletes all score formats',()=>{
 assert.match(sql,/SECURITY DEFINER SET search_path = ''/);
 assert.match(sql,/v_owner IS DISTINCT FROM v_uid/);
 assert.match(sql,/FOR UPDATE/);
 for(const table of ['elleng_team_scores','elleng_pair_hole_scores','elleng_player_hole_scores'])assert.match(sql,new RegExp('DELETE FROM public\\.'+table));
 assert.match(sql,/TO authenticated/);
});
