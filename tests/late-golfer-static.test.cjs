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
test('only fills unreserved golfer slot and appends roster, never rewrites picks',()=>{
 assert.match(sql,/jsonb_set\(gs,ARRAY\[idx::text\],golfer,false\)/);
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

test('active scoring page wires commissioner late add without broad draft save',()=>{
 const html=fs.readFileSync('scoring.html','utf8');
 assert.match(html,/id="addLateGolferBtn"/);
 assert.match(html,/db\.rpc\("elleng_add_late_golfer"/);
 assert.match(html,/p_expected_updated_at:draftUpdatedAt/);
 assert.match(html,/await loadPublicRoster\(\)/);
});

test('new golfer account is checked after commissioner reload',()=>{
 const html=fs.readFileSync('scoring.html','utf8');
 assert.match(html,/await ensureAutomaticPlayerAccounts\(\)/);
 assert.match(html,/Number\(a\.golfer_index\)===Number\(data\.golfer_index\)&&!!a\.user_id/);
 assert.match(html,/player login was not confirmed/);
});

test('safe slot selection rejects occupied indexes and respects 40-player cap',()=>{
 assert.match(sql,/playing_count>=40/);
 assert.match(sql,/coalesce\(btrim\(g->>'name'\),'\s*'\)='\s*'/);
 assert.match(sql,/a\.golfer_index=ord-1/);
 assert.match(sql,/ri=\(ord-1\)::text/);
 assert.match(sql,/p->>'golfer'=\(ord-1\)::text/);
 assert.doesNotMatch(sql,/gs\|\|jsonb_build_array\(golfer\)/);
});

test('post-commit refresh failure cannot be mistaken for failed enrollment',()=>{
 const html=fs.readFileSync('scoring.html','utf8');
 assert.match(html,/database transaction is already committed/);
 assert.match(html,/do not add the golfer twice/);
 assert.match(html,/Late addition was not confirmed\. Refresh before retrying/);
});

test('commissioner can explicitly retry provisioning missing player logins',()=>{
 const html=fs.readFileSync('scoring.html','utf8');
 assert.match(html,/\$\("createMissingLogins"\)\?\.addEventListener\("click"/);
 assert.match(html,/const result=await ensureAutomaticPlayerAccounts\(msg\)/);
 assert.match(html,/if\(!isCommissioner\)/);
});
