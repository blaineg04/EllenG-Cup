'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {TRANSFER_TRANSACTION_STEPS,validateTransferPlan}=require('../lib/post-draft-transfer-transaction-plan.cjs');
test('canonical plan preserves scoring-compatible locks and checks',()=>assert.equal(validateTransferPlan([...TRANSFER_TRANSACTION_STEPS]).ok,true));
test('cannot inspect score rows before acquiring both row locks',()=>{
 const steps=[...TRANSFER_TRANSACTION_STEPS];
 const a=steps.indexOf('verify_setup_and_no_scores_in_all_three_tables');
 const b=steps.indexOf('lock_draft_for_update');
 [steps[a],steps[b]]=[steps[b],steps[a]];
 assert.equal(validateTransferPlan(steps).ok,false);
});
test('cannot write roster before score check',()=>{
 const steps=[...TRANSFER_TRANSACTION_STEPS];
 const a=steps.indexOf('update_golfer_teams_and_rosters_atomically');
 const b=steps.indexOf('verify_setup_and_no_scores_in_all_three_tables');
 [steps[a],steps[b]]=[steps[b],steps[a]];
 assert.equal(validateTransferPlan(steps).ok,false);
});
test('cannot omit stale revision check',()=>{
 const steps=TRANSFER_TRANSACTION_STEPS.filter(s=>s!=='verify_expected_updated_at');
 assert.equal(validateTransferPlan(steps).ok,false);
});
test('cannot omit scoring-compatible advisory lock',()=>{
 const steps=TRANSFER_TRANSACTION_STEPS.filter(s=>s!=='advisory_lock_scoring_namespace');
 assert.equal(validateTransferPlan(steps).ok,false);
});
