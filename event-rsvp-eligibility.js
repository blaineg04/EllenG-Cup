/* EllenG Cup: pure, event-scoped RSVP eligibility helpers.
 * No database writes; safe to load in browsers and Node tests.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.EllenGRsvpEligibility=api;
})(typeof globalThis!=="undefined"?globalThis:null,function(){
  "use strict";
  const validStatuses=new Set(["playing","maybe","out"]);
  const validApprovals=new Set(["pending","approved","declined"]);
  function normalize(r){
    if(!r||typeof r!=="object")throw new TypeError("RSVP must be an object");
    if(typeof r.tournament_id!=="string"||!r.tournament_id.trim())throw new Error("Missing tournament ID");
    if(typeof r.user_id!=="string"||!r.user_id.trim())throw new Error("Missing user ID");
    if(!Number.isInteger(r.golfer_index)||r.golfer_index<0)throw new Error("Invalid golfer index");
    if(!validStatuses.has(r.status))throw new Error("Invalid RSVP status");
    const approval=r.approval_status||"pending";
    if(!validApprovals.has(approval))throw new Error("Invalid approval status");
    return {...r,approval_status:approval};
  }
  function approvedRoster(records,tournamentId,availableGolfers){
    if(typeof tournamentId!=="string"||!tournamentId.trim())throw new Error("Tournament ID required");
    if(!Array.isArray(records)||!Array.isArray(availableGolfers))throw new TypeError("Expected RSVP and golfer arrays");
    const seenUsers=new Set(),seenGolfers=new Set(),indices=[];
    for(const raw of records){
      // Ignore unrelated events before validating their payloads.
      if(!raw||raw.tournament_id!==tournamentId)continue;
      const r=normalize(raw);
      if(seenUsers.has(r.user_id))throw new Error("Duplicate event RSVP user");
      seenUsers.add(r.user_id);
      if(r.status!=="playing"||r.approval_status!=="approved")continue;
      if(seenGolfers.has(r.golfer_index))throw new Error("Duplicate approved golfer");
      if(!availableGolfers[r.golfer_index]?.name?.trim())throw new Error("Approved golfer missing from directory");
      seenGolfers.add(r.golfer_index);indices.push(r.golfer_index);
    }
    return indices.sort((a,b)=>a-b);
  }
  // Pure draft configuration preview; never mutates the live draft.
  function draftRosterPlan(records,tournamentId,availableGolfers,teamCount){
    if(!Number.isInteger(teamCount)||teamCount<2||teamCount>36)
      throw new RangeError("Team count must be between 2 and 36");
    const indices=approvedRoster(records,tournamentId,availableGolfers);
    if(indices.length<teamCount)
      throw new RangeError("Approved golfer count must be at least team count");
    const base=Math.floor(indices.length/teamCount);
    const extra=indices.length%teamCount;
    return Object.freeze({
      tournamentId,teamCount,approvedIndices:Object.freeze(indices),
      teamCapacities:Object.freeze(Array.from({length:teamCount},(_,i)=>base+(i<extra?1:0)))
    });
  }
  function approve(record,decision,actor){
    const r=normalize(record);
    if(!actor||actor.role!=="commissioner"||!actor.user_id)throw new Error("Commissioner authorization required");
    if(decision!=="approved"&&decision!=="declined")throw new Error("Invalid approval decision");
    if(decision==="approved"&&r.status!=="playing")throw new Error("Only playing RSVPs may be approved");
    return {...r,approval_status:decision,approved_by:actor.user_id};
  }
  function changeStatus(record,status){
    const r=normalize(record);
    if(!validStatuses.has(status))throw new Error("Invalid RSVP status");
    return status===r.status?{...r}:{...r,status,approval_status:"pending",approved_by:null};
  }
  return Object.freeze({approvedRoster,draftRosterPlan,approve,changeStatus,normalize});
});
