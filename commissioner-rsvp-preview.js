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
  // The draft is the only available golfer directory here; do not perform
  // a tautological self-reconciliation or imply independent verification.
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
   unapprovedNamedIndices:Object.freeze(unapprovedNamedIndices),
   shortfall:Math.max(0,teamCount-approved.length),
   // Approved players need enough existing named draft slots; do not
   // confuse total team capacity with confirmed roster readiness.
   unnamedSlotCount:Array.from({length:golfers.length},(_,i)=>golfers[i]).filter(g=>!g?.name?.trim()).length,
   // Draft seats cannot be filled by unapproved RSVPs even when the
   // number of named slots exceeds the team minimum.
   approvedSeatCoverage:golfers.length?approved.length/golfers.length:0,
   // Client-side reconciliation is not authorization to save a draft.
   // This preview is only a same-source consistency check, not independent roster verification.
   independentlyVerified:false,
   matchesPreview:approved.length>=teamCount&&unapprovedNamedIndices.length===0&&duplicateNamedIndices.length===0&&Array.from({length:golfers.length},(_,i)=>golfers[i]).every(g=>!!g?.name?.trim())
  });
 }
 function create({db,client,eligibility,eventId,getAuth,getDraft,render,hasPendingRosterEdits=()=>false}){
  if(typeof db?.auth?.getUser!=="function"||typeof client?.list!=="function"||
     typeof eligibility?.approvedRoster!=="function"||
     typeof getAuth!=="function"||typeof getDraft!=="function"||typeof render!=="function"||
     typeof hasPendingRosterEdits!=="function")
   throw new TypeError("Commissioner RSVP preview dependencies required");
  let request=0;
  const enabled=typeof eventId==="string"&&!!eventId.trim();
  function invalidate(){request++;render({status:"invalidated"});}
  async function refresh(){
   const token=++request,auth=getAuth();
   if(!auth?.userId||!Number.isInteger(auth.epoch)){render({status:"invalidated"});return;}
   const current=()=>{
    const now=getAuth();
    return token===request&&now?.epoch===auth.epoch&&now?.userId===auth.userId;
   };
   if(!enabled){render({status:"disabled"});return;}
   render({status:"loading"});
   try{
    // Visible unsaved roster edits must not be certified against old saved slots.
    // Check before network access and again after async reads to fence edits in flight.
    if(hasPendingRosterEdits()){if(current())render({status:"unsaved"});return;}
    // Recheck the authenticated account immediately before reading event data.
    const {data,error}=await db.auth.getUser();
    if(!current())return;
    if(error||data?.user?.id!==auth.userId)
     throw new Error("Commissioner authentication changed");
    if(hasPendingRosterEdits()){if(current())render({status:"unsaved"});return;}
    const rows=await client.list(db,eventId);
    if(!current())return;
    if(hasPendingRosterEdits()){if(current())render({status:"unsaved"});return;}
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
