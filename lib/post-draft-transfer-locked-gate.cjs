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
  // A completed draft is established by authoritative persisted completion state.
  // Do not infer it from a client flag or simply the presence of picks.
  if (draft.status!=='completed') return deny('Draft completion not verified');
  return previewTransfer(draft.state,{
    operation:request?.operation,
    golferIndex:request?.golferIndex,
    otherGolferIndex:request?.otherGolferIndex,
    destinationTeamIndex:request?.destinationTeamIndex,
    draftComplete:true,tournamentStatus:'setup',scoresExist:false
  });
}
module.exports={authorizeLockedTransfer};
