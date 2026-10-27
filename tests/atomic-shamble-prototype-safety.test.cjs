'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('tests/acceptance/atomic-shamble-transaction-prototype.sql','utf8');
test('prototype remains rollback-only and explicitly barred from production',()=>{
 assert.match(sql,/INSECURE TEST-ONLY prototype/);
 assert.match(sql,/^BEGIN;/m);
 assert.match(sql,/^ROLLBACK;/m);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.elleng_test_save_shamble_score/);
});
test('prototype rejects null and duplicate golfer roster entries',()=>{
 assert.match(sql,/p_roster IS NULL/);
 assert.match(sql,/array_position\(p_roster,NULL\) IS NOT NULL/);
 assert.match(sql,/v_count<>v_unique_count/);
});
test('prototype locks a stable database row before changing score tables',()=>{
 const lock=sql.indexOf('FOR UPDATE;');
 const player=sql.indexOf('DELETE FROM public.elleng_player_hole_scores');
 assert.ok(lock>0&&player>lock);
});
