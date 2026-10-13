# EllenG Cup — November 20 scoring persistence verification

Source reviewed: development branch `scoring.html`, `saveScore(teamIndex,val)`.

## Existing behavior observed in source
- Guards score writes using `canEditTeam` and `beginScoreSave`.
- Validates nonempty strokes as integers from 1 to 20.
- Upserts `elleng_team_scores` with conflict key `tournament_id,team_index,hole`.
- Empty values delete a team/hole score.
- Reloads scores after the write and reports success or failure.

These observations **do not** establish deployed database permissions, successful saves, or live synchronization.

## Required staging checks
1. Save a score and reload the page: the correct tournament/team/hole value persists.
2. Change hole immediately after entering a score: ensure the intended hole receives the write.
3. Two captains edit the same team/hole: identify last-writer behavior and prevent silent data loss.
4. Unauthorized player attempts upsert and delete: both rejected by database RLS.
5. Disconnect during save: no false “Saved” confirmation; recovery reloads canonical value.
6. Clear one hole: only the targeted row is deleted.
7. Set tournament status to Final: confirm server-side write protection.
8. Test mobile relative-to-par inputs against pars 3, 4, and 5.
9. Verify viewer leaderboard reflects saved scores without stale PWA caching.

## Release gate
Do not promote the scoring workflow for November 20 until the checks above pass on an isolated test database, with evidence from the MacBook self-hosted runner and a multi-device rehearsal.

Do not change production, main, live Supabase, or FairwayOS without explicit approval.
