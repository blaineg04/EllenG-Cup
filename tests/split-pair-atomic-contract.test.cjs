// Review-only static contract tests. These do not prove concurrency or DB authorization.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','db','patches','20261028_split_pair_atomic_rpc_REVIEW_ONLY.sql'),'utf8');
const range=fs.readFileSync(path.join(__dirname,'..','db','patches','20261028_split_pair_team_total_range_REVIEW_ONLY.sql'),'utf8');
test('Split-Pair RPC uses request-validated, authenticated single-transaction writes',()=>{
 for(const pattern of [/auth\.uid\(\)/,/FOR UPDATE/,/v_owner IS NULL/,/p_tournament_id IS NULL OR btrim\(p_tournament_id\) = ''/,/p_hole NOT BETWEEN 1 AND 18/,/p_pair_index NOT BETWEEN 0 AND 1/,/p_score NOT BETWEEN 1 AND 20/,/v_state->>'playFormat' IS DISTINCT FROM 'split_pair'/,/jsonb_array_length\(v_roster\)<>4/,/v_idx=ANY\(v_indexes\)/,/ON CONFLICT \(tournament_id,hole,team_index,pair_index\)/,/ON CONFLICT \(tournament_id,team_index,hole\)/])assert.match(sql,pattern);
});
test('staged function does not grant RPC to anonymous roles',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.elleng_test_authorized_split_pair\([^;]+ FROM PUBLIC,anon;/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.elleng_test_authorized_split_pair\([^;]+ TO authenticated;/);
 assert.match(sql,/SECURITY DEFINER\s+SET search_path = ''/);
});
test('team score range patch explicitly supports 40 stroke split pair totals',()=>{
 assert.match(range,/score >= 1 AND score <= 40/);
 assert.match(range,/REVIEW ONLY/);
});
