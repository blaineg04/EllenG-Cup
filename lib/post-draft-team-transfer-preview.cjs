'use strict';
// Pure preview/validation only. Never writes a draft or production data.
function indexOfMember(entry) {
  return Number.isInteger(entry) ? entry :
    entry && typeof entry === 'object' && Number.isInteger(entry.golferIndex) ? entry.golferIndex : null;
}
function previewTransfer(state, request) {
  const fail = reason => ({ok:false, reason});
  if (!state || !Array.isArray(state.golfers) || !Array.isArray(state.teams) || state.teams.length !== 2) return fail('Expected a two-team draft');
  if (!request || !['move','swap'].includes(request.operation)) return fail('Invalid operation');
  if (!Array.isArray(state.picks) || !state.picks.length) return fail('Draft has no picks');
  // Preview is not a source of authorization. The server must independently verify
  // draft completion, tournament setup, score tables, and commissioner identity.
  if (request.draftComplete !== true) return fail('Draft completion not verified');
  if (request.tournamentStatus !== 'setup') return fail('Tournament setup not verified');
  if (request.scoresExist !== false) return fail('Scoring status not verified as empty');
  const a=request.golferIndex, b=request.otherGolferIndex;
  const valid = i => Number.isInteger(i) && i >= 0 && i < state.golfers.length && state.golfers[i] && String(state.golfers[i].name||'').trim() && state.golfers[i].participating !== false && state.golfers[i].withdrawn !== true;
  if (!valid(a)) return fail('Invalid or inactive golfer');
  if (request.operation==='swap' && (!valid(b) || a===b)) return fail('Invalid swap golfer');
  if (state.teams.some(t=>!Array.isArray(t.roster))) return fail('Invalid team roster');
  const allMembers=state.teams.flatMap(t=>t.roster.map(indexOfMember));
  if (allMembers.some(i=>!Number.isInteger(i) || i<0 || i>=state.golfers.length)) return fail('Invalid roster member index');
  if (new Set(allMembers).size!==allMembers.length) return fail('Duplicate golfer in rosters');
  for (let teamIndex=0;teamIndex<2;teamIndex++) {
    for (const entry of state.teams[teamIndex].roster) {
      const golfer=state.golfers[indexOfMember(entry)];
      if (!golfer || golfer.team!==teamIndex) return fail('Stored roster and golfer team disagree');
    }
  }
  for (let i=0;i<state.golfers.length;i++) {
    const golfer=state.golfers[i];
    if (!golfer || ![0,1].includes(golfer.team)) continue;
    if (allMembers.filter(member=>member===i).length!==1) return fail('Assigned golfer missing from roster');
  }
  const membership=i=>state.teams.flatMap((team,teamIndex)=>(team.roster||[]).filter(entry=>indexOfMember(entry)===i).map(()=>teamIndex));
  const ma=membership(a);
  if(ma.length!==1) return fail('Golfer must appear in exactly one roster');
  const source=ma[0], target=1-source;
  if (state.golfers[a].team !== source) return fail('Golfer team and roster disagree');
  if(request.operation==='swap' && (membership(b).length!==1 || membership(b)[0]!==target || state.golfers[b].team!==target)) return fail('Swap golfer must be on opposite team exactly once');
  if (request.operation==='move' && request.destinationTeamIndex!==target) return fail('Destination must be the opposite team');
  const captain=i=>state.teams.some(t=>{
    const marker=t.captain;
    return marker===i || (marker && typeof marker==='object' && marker.golferIndex===i) ||
      (typeof marker==='string' && marker.trim().toLowerCase()===String(state.golfers[i].name).trim().toLowerCase());
  });
  if(captain(a) || (request.operation==='swap' && captain(b))) return fail('Captains cannot be transferred');
  if (request.operation==='move' && Number.isInteger(request.destinationCapacity) && state.teams[target].roster.length >= request.destinationCapacity) return fail('Destination team at capacity');
  return {ok:true,operation:request.operation,sourceTeamIndex:source,destinationTeamIndex:target,golferIndex:a,...(request.operation==='swap'?{otherGolferIndex:b}:{})};
}
module.exports={previewTransfer};
