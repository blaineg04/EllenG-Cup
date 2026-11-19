'use strict';
// Declarative lock/check order for the future database RPC.
// This does NOT execute SQL or authorize a real transfer.
const TRANSFER_TRANSACTION_STEPS=Object.freeze([
 'begin_transaction',
 'advisory_lock_scoring_namespace',
 'lock_tournament_for_update',
 'lock_draft_for_update',
 'verify_owner_and_draft_identity',
 'verify_persisted_draft_complete',
 'verify_setup_and_no_scores_in_all_three_tables',
 'verify_expected_updated_at',
 'verify_roster_and_captains',
 'update_golfer_teams_and_rosters_atomically',
 'verify_postconditions',
 'commit_transaction'
]);
function validateTransferPlan(steps){
 const fail=reason=>({ok:false,reason});
 if(!Array.isArray(steps)||steps.length!==TRANSFER_TRANSACTION_STEPS.length)return fail('Unexpected transaction steps');
 for(let i=0;i<steps.length;i++)if(steps[i]!==TRANSFER_TRANSACTION_STEPS[i])return fail('Unsafe or missing transaction step at '+i);
 return {ok:true};
}
module.exports={TRANSFER_TRANSACTION_STEPS,validateTransferPlan};
