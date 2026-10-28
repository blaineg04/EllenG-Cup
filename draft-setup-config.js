/* Commissioner-only draft setup sizing. Pure: no auth, database, or live writes.
 * Call only before picks begin; the existing secureSave path persists the result.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.EllenGDraftSetup=api;
})(typeof globalThis!=="undefined"?globalThis:null,function(){
  "use strict";
  // All commissioner setup edits must stop once the draft has any assignments.
  // Resizing was already guarded, but Save Setup could previously rewrite
  // golfer names, handicap bands, team names or draft order after a live pick.
  function assertDraftSetupEditable(state){
    if(!state||!Array.isArray(state.golfers)||!Array.isArray(state.teams)||!Array.isArray(state.picks))
      throw new TypeError("Invalid draft state");
    if(state.picks.length||state.teams.some(t=>!t||!Array.isArray(t.roster)||t.roster.length)||
       state.golfers.some(g=>!g||g.team!=null))
      throw new Error("Cannot resize after draft picks or assignments; undo picks first");
    return true;
  }
  function resizeDraftSetup(state,teamCount,golferCount){
    if(!Number.isInteger(teamCount)||teamCount<2||teamCount>36)
      throw new RangeError("Teams must be between 2 and 36");
    if(!Number.isInteger(golferCount)||golferCount<teamCount||golferCount>500)
      throw new RangeError("Golfer slots must be between team count and 500");
    assertDraftSetupEditable(state);
    for(let i=golferCount;i<state.golfers.length;i++){
      const g=state.golfers[i];
      if(String(g.name??"").trim()||String(g.hcp??"").trim()||String(g.band??"").trim())
        throw new Error("Cannot remove a golfer slot containing information");
    }
    for(let i=teamCount;i<state.teams.length;i++){
      const t=state.teams[i];
      if(String(t.captain??"").trim()||
         (String(t.name??"").trim()&&String(t.name).trim()!=="Team "+(i+1)))
        throw new Error("Cannot remove a named team or assigned captain");
    }
    const golfers=Array.from({length:golferCount},(_,i)=>i<state.golfers.length
      ?{...state.golfers[i]}
      :{name:"",hcp:"",band:"",team:null});
    const teams=Array.from({length:teamCount},(_,i)=>i<state.teams.length
      ?{...state.teams[i],roster:[...state.teams[i].roster]}
      :{name:"Team "+(i+1),captain:"",roster:[]});
    return {...state,golfers,teams,picks:[]};
  }
  return Object.freeze({resizeDraftSetup,assertDraftSetupEditable});
});
