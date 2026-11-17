const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('db/releases/late-golfer/staged.sql','utf8');
const draft=fs.readFileSync('draft.html','utf8');
test('late add is separate from the existing participation RPC',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.elleng_add_late_golfer/);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.elleng_set_player_participation/);
});
test('commissioner and stale-state guards',()=>{
 assert.match(sql,/d\.owner_id IS DISTINCT FROM auth\.uid\(\)/);
 assert.match(sql,/d\.updated_at IS DISTINCT FROM p_expected_updated_at/);
 assert.match(sql,/FOR UPDATE/g);
});
test('all score types prevent late enrollment',()=>{
 for(const table of ['elleng_team_scores','elleng_player_hole_scores','elleng_pair_hole_scores'])assert.ok(sql.includes(table));
});
test('only appends golfer and roster, never rewrites picks',()=>{
 assert.match(sql,/gs\|\|jsonb_build_array\(golfer\)/);
 assert.match(sql,/roster\|\|to_jsonb\(idx\)/);
 assert.doesNotMatch(sql,/jsonb_set\(s,\s*'\{picks\}'/);
});
test('draft completion excludes late additions',()=>{
 assert.match(draft,/g\.late_added!==true/);
 assert.match(sql,/late_added.*true/);
});
test('permissions fail closed for anonymous users',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.elleng_add_late_golfer/);
 assert.match(sql,/FROM PUBLIC,anon/);
});
