'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sql=fs.readFileSync('tests/acceptance/authorized-shamble-rpc-proposal.sql','utf8');
test('staged RPC gets identity from auth not a supplied user id',()=>{
 assert.match(sql,/auth\.uid\(\)/);
 assert.doesNotMatch(sql,/p_user_id/);
});
test('staged RPC derives roster from persisted draft, not client input',()=>{
 assert.match(sql,/elleng_drafts/);
 assert.match(sql,/elleng_captains/);
 assert.match(sql,/v_state->'teams'/);
 assert.doesNotMatch(sql,/p_roster/);
});
test('staged RPC holds transaction lock and does not grant browser execution',()=>{
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.doesNotMatch(sql,/WHERE t\.id=p_tournament_id FOR UPDATE/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
 assert.doesNotMatch(sql,/GRANT EXECUTE/);
});

test('staged RPC rejects a missing hole explicitly',()=>{
 assert.match(sql,/p_hole\s+IS\s+NULL/i);
});

test('staged shamble scoring rejects out-of-range holes and scores',()=>{
 assert.match(sql,/p_hole NOT BETWEEN 10 AND 18/);
 assert.match(sql,/p_score NOT BETWEEN 1 AND 20/);
 assert.match(sql,/p_team_index<t.team_count/);
});
test('staged shamble scoring refuses roster duplication and unassigned golfer',()=>{
 assert.match(sql,/count\(DISTINCT golfer\)/);
 assert.match(sql,/p_golfer_index<>ALL\(v_roster\)/);
});
test('staged shamble scoring clears incomplete team totals and does not grant privileges',()=>{
 assert.match(sql,/IF v_count<>cardinality\(v_roster\) THEN[\s\S]*?DELETE FROM public\.elleng_team_scores/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.doesNotMatch(sql,/GRANT EXECUTE/);
});

test('shamble score writes are serialized and derived from recorded golfer scores',()=>{
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/count\(\*\),min\(score\)/);
 assert.match(sql,/ON CONFLICT\(tournament_id,team_index,hole\)/);
});
test('shamble scoring enforces captain or owner authority and active tournament state',()=>{
 assert.match(sql,/t\.status IN \('setup','live'\)/);
 assert.match(sql,/d\.owner_id=v_uid/);
 assert.match(sql,/c\.user_id=v_uid/);
 assert.match(sql,/p_team_index<t\.team_count/);
});

test('team eligibility follows saved tournament team_count, not fixed nine-team limit',()=>{
 assert.match(sql,/p_team_index < 0/);
 assert.match(sql,/p_team_index<t\.team_count/);
 assert.doesNotMatch(sql,/p_team_index NOT BETWEEN 0 AND 8/);
});

test('Shamble holds a shared draft lock during format and roster authorization',()=>{
 assert.match(sql,/FOR SHARE OF d/);
});
