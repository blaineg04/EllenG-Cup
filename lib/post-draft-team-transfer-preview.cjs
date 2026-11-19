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
  if (request.scoresExist !== false) return fail('Scoring status not verified as empty');
  const a=request.golferIndex, b=request.otherGolferIndex;
  const valid = i => Number.isInteger(i) && i >= 0 && i < state.golfers.length && state.golfers[i] && String(state.golfers[i].name||'').trim() && state.golfers[i].participating !== false && state.golfers[i].withdrawn !== true;
  if (!valid(a)) return fail('Invalid or inactive golfer');
  if (request.operation==='swap' && (!valid(b) || a===b)) return fail('Invalid swap golfer');
  const membership=i=>state.teams.flatMap((team,teamIndex)=>(team.roster||[]).filter(entry=>indexOfMember(entry)===i).map(()=>teamIndex));
  const ma=membership(a);
  if(ma.length!==1) return fail('Golfer must appear in exactly one roster');
  const source=ma[0], target=1-source;
  if(request.operation==='swap' && (membership(b).length!==1 || membership(b)[0]!==target)) return fail('Swap golfer must be on opposite team exactly once');
  if (request.operation==='move' && request.destinationTeamIndex!==target) return fail('Destination must be the opposite team');
  const captain=i=>state.teams.some(t=>String(t.captain||'').trim().toLowerCase()===String(state.golfers[i].name).trim().toLowerCase());
  if(captain(a) || (request.operation==='swap' && captain(b))) return fail('Captains cannot be transferred');
  if (request.operation==='move' && Number.isInteger(request.destinationCapacity) && state.teams[target].roster.length >= request.destinationCapacity) return fail('Destination team at capacity');
  return {ok:true,operation:request.operation,sourceTeamIndex:source,destinationTeamIndex:target,golferIndex:a,...(request.operation==='swap'?{otherGolferIndex:b}:{})};
}
module.exports={previewTransfer};
