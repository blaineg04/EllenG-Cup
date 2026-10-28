/* Read-only commissioner RSVP rehearsal preview.
 * Disabled unless an explicit event ID and feature flag are configured.
 * Never imports golfers, changes draft state, or performs database writes.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 else root.EllenGCommissionerRsvpPreview=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 function summarize(rows,eventId,golfers,teamCount,eligibility){
  if(!Array.isArray(golfers))throw new TypeError("Draft golfer directory required");
  if(!Number.isInteger(teamCount)||teamCount<2||teamCount>36)
   throw new RangeError("Valid team count required");
  const approved=eligibility.approvedRoster(rows,eventId,golfers);
  // An approved RSVP is not matched until its draft slot contains the
  // corresponding directory name. Empty or renamed slots are not ready.
  const reconciliation=eligibility.reconcileDraftRoster(rows,eventId,golfers,golfers);
  const missingApprovedIndices=reconciliation.missingIndices;
  const mismatchedApprovedIndices=reconciliation.mismatchedIndices;
  // Duplicate display names make a commissioner roster ambiguous even when
  // account IDs and golfer indices are unique. Do not report it as ready.
  const names=new Set();
  const duplicateNamedIndices=[];
  for(let index=0;index<golfers.length;index++){
   const name=golfers[index]?.name?.trim().toLocaleLowerCase();
   if(!name)continue;
   if(names.has(name))duplicateNamedIndices.push(index);
   names.add(name);
  }
  const approvedSet=new Set(approved);
  const unapprovedNamedIndices=golfers.flatMap((golfer,index)=>
   golfer?.name?.trim()&&!approvedSet.has(index)?[index]:[]);
  return Object.freeze({
   approvedCount:approved.length,
   approvedIndices:Object.freeze(approved),
   unapprovedNamedCount:unapprovedNamedIndices.length,
   duplicateNamedCount:duplicateNamedIndices.length,
   duplicateNamedIndices:Object.freeze(duplicateNamedIndices),
   missingApprovedCount:missingApprovedIndices.length,
   missingApprovedIndices:Object.freeze([...missingApprovedIndices]),
   mismatchedApprovedCount:mismatchedApprovedIndices.length,
   mismatchedApprovedIndices:Object.freeze([...mismatchedApprovedIndices]),
   unapprovedNamedIndices:Object.freeze(unapprovedNamedIndices),
   shortfall:Math.max(0,teamCount-approved.length),
   // Client-side reconciliation is not authorization to save a draft.
   matchesPreview:approved.length>=teamCount&&reconciliation.ready&&duplicateNamedIndices.length===0
  });
 }
 function create({db,client,eligibility,eventId,getAuth,getDraft,render}){
  if(!db?.auth?.getUser||!client?.list||!eligibility?.approvedRoster||
     typeof getAuth!=="function"||typeof getDraft!=="function"||typeof render!=="function")
   throw new TypeError("Commissioner RSVP preview dependencies required");
  let request=0;
  const enabled=typeof eventId==="string"&&!!eventId.trim();
  function invalidate(){request++;}
  async function refresh(){
   const token=++request,auth=getAuth();
   if(!auth?.userId||!Number.isInteger(auth.epoch))return;
   const current=()=>{
    const now=getAuth();
    return token===request&&now?.epoch===auth.epoch&&now?.userId===auth.userId;
   };
   if(!enabled){render({status:"disabled"});return;}
   render({status:"loading"});
   try{
    // Recheck the authenticated account immediately before reading event data.
    const {data,error}=await db.auth.getUser();
    if(!current())return;
    if(error||data?.user?.id!==auth.userId)
     throw new Error("Commissioner authentication changed");
    const rows=await client.list(db,eventId);
    if(!current())return;
    const draft=getDraft();
    const summary=summarize(rows,eventId,draft?.golfers,draft?.teams?.length,eligibility);
    if(!current())return;
    render({status:"success",summary});
   }catch(error){
    if(current())render({status:"error"});
   }
  }
  return Object.freeze({refresh,invalidate,enabled});
 }
 return Object.freeze({create,summarize});
});
