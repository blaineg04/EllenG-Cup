'use strict';
// Release security gate: the prototype must never be shipped as an authenticated RPC
// while it accepts client-supplied roster membership and lacks caller verification.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sql=fs.readFileSync('tests/acceptance/authorized-shamble-rpc-proposal.sql','utf8');
// The older function is a disposable-only fixture and must not be promoted to browser RPC.
test('atomic Shamble RPC must derive roster on server rather than trust p_roster',()=>{
 assert.doesNotMatch(sql,/p_roster\s+integer\[\]/i,'Untrusted caller-supplied roster remains in RPC signature');
});
test('atomic Shamble RPC must authorize current user against ownership or team captain',()=>{
 assert.match(sql,/auth\.uid\s*\(\s*\)/i,'Function does not check authenticated user');
 assert.match(sql,/elleng_captains/i,'Function does not verify captain assignments');
 assert.match(sql,/elleng_drafts/i,'Function does not verify commissioner ownership');
});
