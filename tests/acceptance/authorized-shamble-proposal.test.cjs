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
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
 assert.doesNotMatch(sql,/GRANT EXECUTE/);
});
