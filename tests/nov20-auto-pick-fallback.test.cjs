const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const migration=fs.readFileSync(path.join(__dirname,'..','sql','nov20-auto-pick-balance-fallback.sql'),'utf8');
test('auto-pick matches manual lowest-penalty draft eligibility',()=>{
 assert.match(migration,/elleng_pick_balance_penalty\(v_state,v_turn,v_band\)/);
 assert.match(migration,/v_other_count < v_lowest/);
 assert.match(migration,/v_candidates := ARRAY\[v_i\]/);
 assert.match(migration,/v_other_count = v_lowest/);
});
test('auto-pick still enforces permissions, paused clock, and row lock',()=>{
 for(const fragment of ['auth.uid()','Not authorized for this draft','for update','timerPaused','timerEndsAt','now() < v_deadline','v_pick_count >= v_total_picks']){
  assert.ok(migration.includes(fragment),fragment+' must be preserved');
 }
});
test('migration does not change draft rows at installation',()=>{
 assert.match(migration,/BEGIN;/);
 assert.match(migration,/COMMIT;/);
 assert.doesNotMatch(migration,/\bDELETE FROM\b|\bTRUNCATE\b/i);
});
