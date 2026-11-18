"use strict";

/**
 * Pure pre-scoring withdrawal policy. Does not write to the live database.
 * Team roster indexes, draft picks and accounts are intentionally immutable.
 */
function activeRoster(state, teamIndex) {
  const golfers = Array.isArray(state?.golfers) ? state.golfers : [];
  const roster = state?.teams?.[teamIndex]?.roster;
  if (!Array.isArray(roster)) return [];
  const seen = new Set();
  return roster.filter(entry => {
    const index = typeof entry === "object" && entry !== null ? entry.golferIndex : entry;
    if (!Number.isSafeInteger(index) || seen.has(index)) return false;
    const golfer = golfers[index];
    if (!golfer || golfer.participating === false || !String(golfer.name || "").trim()) return false;
    if (golfer.team != null && Number(golfer.team) !== teamIndex) return false;
    seen.add(index);
    return true;
  }).map(entry => typeof entry === "object" && entry !== null ? entry.golferIndex : entry);
}

function preflightWithdrawal({state, golferIndex, scoresExist, expectedUpdatedAt, actualUpdatedAt}) {
  if (!state || !Array.isArray(state.golfers) || !Array.isArray(state.teams) ||
      state.teams.length !== 2 || !Array.isArray(state.picks))
    return {ok:false, reason:"Invalid draft structure"};
  if (expectedUpdatedAt == null || expectedUpdatedAt !== actualUpdatedAt)
    return {ok:false, reason:"Tournament changed; refresh and retry"};
  if (scoresExist !== false)
    return {ok:false, reason:"Withdrawal after scoring begins is not supported"};
  if (!Number.isSafeInteger(golferIndex) || golferIndex < 0 || golferIndex >= state.golfers.length)
    return {ok:false, reason:"Invalid golfer"};
  const golfer = state.golfers[golferIndex];
  if (!golfer || !String(golfer.name || "").trim() || golfer.participating === false)
    return {ok:false, reason:"Golfer is not active"};
  if (state.teams.some(t => String(t.captain || "").trim().toLowerCase() === String(golfer.name).trim().toLowerCase()))
    return {ok:false, reason:"Captain withdrawal requires a separate policy"};
  const matches = state.teams.map((_,i) => activeRoster(state,i).includes(golferIndex) ? i : -1).filter(i => i >= 0);
  if (matches.length !== 1) return {ok:false, reason:"Golfer must belong to exactly one team"};
  const originalCount = state.golfers.filter(g => g && String(g.name || "").trim() && g.participating !== false && g.late_added !== true).length;
  if (state.picks.length < originalCount)
    return {ok:false, reason:"Completed draft required"};
  return {ok:true, teamIndex:matches[0]};
}

function previewWithdrawal({state, golferIndex, scoresExist, expectedUpdatedAt, actualUpdatedAt}) {
  const validation = preflightWithdrawal({state,golferIndex,scoresExist,expectedUpdatedAt,actualUpdatedAt});
  if (!validation.ok) return validation;
  const next = JSON.parse(JSON.stringify(state));
  next.golfers[golferIndex].participating = false;
  next.golfers[golferIndex].withdrawn = true;
  return {ok:true, teamIndex:validation.teamIndex, state:next,
    activeCounts:next.teams.map((_,i) => activeRoster(next,i).length)};
}

function preflightRestore({state, golferIndex, scoresExist, expectedUpdatedAt, actualUpdatedAt}) {
  if (!state || !Array.isArray(state.golfers) || !Array.isArray(state.teams) ||
      state.teams.length !== 2 || !Array.isArray(state.picks))
    return {ok:false, reason:"Invalid draft structure"};
  if (expectedUpdatedAt == null || expectedUpdatedAt !== actualUpdatedAt)
    return {ok:false, reason:"Tournament changed; refresh and retry"};
  if (scoresExist !== false) return {ok:false, reason:"Restore after scoring begins is not supported"};
  if (state.picks.length !== 23) return {ok:false, reason:"Completed draft required"};
  if (!Number.isSafeInteger(golferIndex) || golferIndex < 0 || golferIndex >= state.golfers.length)
    return {ok:false, reason:"Invalid golfer"};
  const golfer=state.golfers[golferIndex];
  if (!golfer || !String(golfer.name||"").trim() || golfer.participating !== false || golfer.withdrawn !== true)
    return {ok:false, reason:"Golfer is not withdrawn"};
  if (state.teams.some(t=>String(t.captain||"").trim().toLowerCase()===String(golfer.name).trim().toLowerCase()))
    return {ok:false, reason:"Captain restore requires separate policy"};
  const matches=state.teams.map((t,i)=>({i,found:Array.isArray(t.roster)&&t.roster.some(r=>(typeof r==="object"&&r!==null?r.golferIndex:r)===golferIndex)})).filter(x=>x.found);
  if(matches.length!==1) return {ok:false, reason:"Original team assignment missing"};
  return {ok:true,teamIndex:matches[0].i};
}
function previewRestore(args) {
  const result=preflightRestore(args);
  if(!result.ok) return result;
  const next=JSON.parse(JSON.stringify(args.state));
  const golfer=next.golfers[args.golferIndex];
  golfer.participating=true;
  golfer.withdrawn=false;
  delete golfer.withdrawn_at;
  delete golfer.withdrawal_reason;
  return {ok:true,teamIndex:result.teamIndex,state:next,activeCounts:next.teams.map((_,i)=>activeRoster(next,i).length)};
}

if (typeof module !== "undefined") module.exports = {activeRoster,preflightWithdrawal,previewWithdrawal,preflightRestore,previewRestore};
