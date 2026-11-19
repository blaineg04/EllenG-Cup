'use strict';
// Pure server-side decision helper. Inputs must be read from locked DB rows,
// never from client-supplied status, ownership, or score flags.
const {previewTransfer} = require('./post-draft-team-transfer-preview.cjs');
function authorizeLockedTransfer({actorId,draft,tournament,scoreCounts,expectedUpdatedAt,request}) {
  const deny=reason=>({ok:false,reason});
  if (!actorId || !draft || String(draft.owner_id)!==String(actorId)) return deny('Commissioner authorization required');
  if (!tournament || tournament.draft_id!==draft.id) return deny('Tournament and draft do not match');
  if (tournament.status!=='setup') return deny('Tournament is not in setup');
  if (!expectedUpdatedAt || !draft.updated_at || String(expectedUpdatedAt)!==String(draft.updated_at)) return deny('Stale draft revision');
  if (!scoreCounts || !['player','team','pair'].every(k=>Number.isSafeInteger(scoreCounts[k]) && scoreCounts[k]===0)) return deny('Score tables must be empty');
  if (!draft.state || !Array.isArray(draft.state.picks) || !Array.isArray(draft.state.golfers)) return deny('Invalid persisted draft');
  // Live EllenG weighted drafts retain status='setup' after picks are complete.
  // Match the installed weighted-roster guard's original-assignment count.
  if (draft.state.draftRules!=='weighted') return deny('Weighted draft required');
  const originals=draft.state.golfers.filter(g=>g && String(g.name||'').trim() &&
    (g.team===0 || g.team===1 || g.team==='0' || g.team==='1') &&
    g.late_added!==true && g.late_added!=='true').length;
  if (originals<2 || draft.state.picks.length<originals) return deny('Draft completion not verified');
  return previewTransfer(draft.state,{
    operation:request?.operation,
    golferIndex:request?.golferIndex,
    otherGolferIndex:request?.otherGolferIndex,
    destinationTeamIndex:request?.destinationTeamIndex,
    draftComplete:true,tournamentStatus:'setup',scoresExist:false
  });
}
module.exports={authorizeLockedTransfer};
