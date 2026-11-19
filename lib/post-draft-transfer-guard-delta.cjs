'use strict';
// Models the *required* trigger-side JSON delta check. No SQL, auth or persistence.
// Server-side auth, score checks, advisory locks, and tournament status are separate.
const {validateTransferPostcondition}=require('./post-draft-team-transfer-postcondition.cjs');
const {previewTransfer}=require('./post-draft-team-transfer-preview.cjs');
function validateGuardedTransferDelta(oldState,newState,request){
 const fail=reason=>({ok:false,reason});
 if(!oldState||!newState||oldState.draftRules!=='weighted'||newState.draftRules!=='weighted')
  return fail('Weighted draft required');
 if(JSON.stringify(oldState.picks)!==JSON.stringify(newState.picks))
  return fail('Draft picks changed');
 const pre=previewTransfer(oldState,request);
 if(!pre.ok)return pre;
 const post=validateTransferPostcondition(oldState,newState,request);
 if(!post.ok)return post;
 const changed=[];
 for(let i=0;i<oldState.golfers.length;i++){
  if(JSON.stringify(oldState.golfers[i])!==JSON.stringify(newState.golfers[i]))changed.push(i);
 }
 const expected=request.operation==='swap'?[request.golferIndex,request.otherGolferIndex]:[request.golferIndex];
 if(changed.length!==expected.length||expected.some(i=>!changed.includes(i)))
  return fail('Unexpected golfer changes');
 // Must actually change both rosters and not merely alter golfer.team.
 if(JSON.stringify(oldState.teams[0].roster)===JSON.stringify(newState.teams[0].roster)||
 JSON.stringify(oldState.teams[1].roster)===JSON.stringify(newState.teams[1].roster))
  return fail('Both rosters must change');
 return {ok:true};
}
module.exports={validateGuardedTransferDelta};
