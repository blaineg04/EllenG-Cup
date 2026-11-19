'use strict';
// Commissioner UI view-model only. No database writes and no authorization claims.
const {previewTransfer}=require('./post-draft-team-transfer-preview.cjs');
function buildCommissionerTransferView(state, options={}) {
  const teams=Array.isArray(state?.teams)?state.teams:[];
  const golfers=Array.isArray(state?.golfers)?state.golfers:[];
  const captain=(i)=>teams.some(t=>t.captain===i ||
    (typeof t.captain==='string' && t.captain.trim().toLowerCase()===String(golfers[i]?.name||'').trim().toLowerCase()) ||
    (t.captain && typeof t.captain==='object' && t.captain.golferIndex===i));
  const available=teams.map((team,teamIndex)=>({
    teamIndex,
    label:typeof team.name==='string' && team.name.trim()?team.name:'Team '+(teamIndex+1),
    golfers:(Array.isArray(team.roster)?team.roster:[]).map(entry=>typeof entry==='number'?entry:entry?.golferIndex)
      .filter(i=>Number.isInteger(i) && i>=0 && i<golfers.length && golfers[i] && String(golfers[i].name||'').trim())
      .filter(i=>golfers[i].participating!==false && golfers[i].withdrawn!==true)
      .map(i=>({index:i,name:golfers[i].name,captain:captain(i),selectable:!captain(i)}))
  }));
  return {teams:available,canSubmit:false,reason:'Select a golfer and preview the proposed change'};
}
function previewCommissionerChange(state,operation,golferIndex,otherGolferIndex,verified={}) {
  const request={operation,golferIndex,otherGolferIndex,
    destinationTeamIndex:1-state?.golfers?.[golferIndex]?.team,
    draftComplete:verified.draftComplete===true,
    tournamentStatus:verified.tournamentStatus,
    scoresExist:verified.scoresExist};
  const result=previewTransfer(state,request);
  if(!result.ok) return {ok:false,reason:result.reason,canSubmit:false};
  const from=state.teams[result.sourceTeamIndex];
  const to=state.teams[result.destinationTeamIndex];
  return {ok:true,canSubmit:false,requiresServerRevalidation:true,
    operation,fromTeam:from.name||'Team '+(result.sourceTeamIndex+1),
    toTeam:to.name||'Team '+(result.destinationTeamIndex+1),
    golfer:state.golfers[golferIndex].name,
    ...(operation==='swap'?{otherGolfer:state.golfers[otherGolferIndex].name}:{}),
    reason:'Preview only: secure production RPC is not yet installed'};
}
module.exports={buildCommissionerTransferView,previewCommissionerChange};
