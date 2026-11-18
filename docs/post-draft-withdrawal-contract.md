# Post-draft golfer withdrawal — implementation contract (STAGED, NOT DEPLOYED)

## Approved scoring policy
- Uneven active team sizes are allowed; no balancing, average points, replacement points, handicap compensation, or recalculated draft.
- Sum only active golfers' actual recorded points after withdrawal.
- Preserve original draft picks and golfer indexes permanently.
- Keep golfer account and name visible in the Players directory, marked Withdrawn.
- Commissioner-only withdraw and restore before first score; no golfer self-service.
- Withdrawn golfers cannot submit scores. Existing scores must never be silently erased.
- Restore only before any scores have been recorded, with an explicit commissioner confirmation.

## Safety conditions for backend RPC
1. Require auth.uid() and draft.owner_id = auth.uid(); revoke PUBLIC and anon EXECUTE.
2. Require exact draft id elleng-cup, tournament id elleng-cup-live, and expected updated_at for optimistic concurrency.
3. Lock tournament and draft rows FOR UPDATE, then validate completed draft marker and two-team shamble format.
4. Require named active golfer in exactly one team roster. Do not permit withdrawing a captain without a separate captain-reassignment policy.
5. Reject withdrawal once any player, team, or pair score exists, unless a separate scored-withdrawal design is reviewed and tested. This first release is **pre-scoring only**.
6. Preserve all picks, original team assignment, account rows, and scoring records. Mark participating=false, withdrawn=true, withdrawn_at and withdrawal_reason; do not delete golfer or reorder indexes.
7. Do not remove the golfer's roster index from draft history; filter withdrawn golfers from **active** rosters and scoring. Ensure all public team views show active counts and an optional withdrawn marker.
8. Add a narrowly scoped exception to the existing elleng_guard_weighted_roster trigger **only** for this authenticated, validated RPC path. Never disable triggers in production as a runtime workflow.
9. Ensure all shamble summary and score-write paths exclude withdrawn golfers, and test that they reject writes for withdrawn golfer indexes.
10. On restore before scoring, reset participating=true, withdrawn=false, preserve same roster and account, and prevent duplicate restore.

## Test matrix
- 24 -> 23 active golfers, Team 1 12 / Team 2 11 (and inverse), with 23 picks unchanged.
- Withdraw and restore a C-band noncaptain; account link and original team roster index unchanged.
- No changes to any golfer's handicap, name, team, or existing pick.
- Unauthorized and stale-state RPC attempts fail; repeat withdraw fails; captain withdrawal fails.
- Scored tournament withdrawal fails closed; no score rows deleted or altered.
- Score submission by withdrawn golfer fails; active players' shamble totals remain raw sums.
- Mobile commissioner confirmation and Teams / Players / My Score regression tests.
- Run isolated database contract tests and two-device scoring rehearsal before any production migration or merge.

## Release gate
Do not deploy to the November 20 live tournament until the RPC, trigger, UI, score-write protections, and isolated end-to-end tests are implemented and pass. No live golfer is to be withdrawn for testing.

## Isolated authenticated release rehearsal (required; not yet completed)
1. Create a **separate disposable Supabase database** and deploy the staged SQL there in dependency order: weighted-roster guard, withdraw RPC, restore RPC, then inactive-score trigger. Never use the live EllenG Cup project for test writes.
2. Seed a representative **two-team, 23-pick shamble draft** with 24 active golfers (one late addition), two captains, stable golfer indexes, and no scores. Capture baseline draft JSON, team rosters, account links, and score-row counts.
3. Sign in as the commissioner using an isolated test account. In a real browser at 320px and 390px, verify both selectors populate on opening the commissioner screen. Withdraw a noncaptain on Team 2, accept confirmation, and verify 12 vs 11 active golfers, zero compensating points, original 23 picks and team rosters unchanged, and the golfer marked Withdrawn in Players.
4. Sign in as a different authenticated golfer. Verify commissioner controls are inaccessible and direct withdrawal/restore RPC requests are denied. Verify scoring as the withdrawn golfer is rejected by the database.
5. Sign back in as commissioner. Restore the golfer, confirm 12 vs 12 active roster, unchanged draft picks and account link, and both dropdowns refresh.
6. Repeat withdrawal and restore with a Team 1 noncaptain, plus cancel confirmation, stale timestamp, captain selection, duplicate withdrawal/restore, and simulated network errors. Confirm errors are visible and buttons recover.
7. Begin scoring for a different active golfer. Verify **both** withdrawal and restore are blocked, and the score remains intact. Test score-first and withdrawal-first races with separate database sessions.
8. Verify the mobile Home, Teams, My Score, Players, and commissioner layouts have not regressed. Confirm all relevant CI workflows pass for the exact proposed release commit.
9. Record environment ID, commit SHA, screenshots, actual browser results, tester, and timestamp. Only after all gates pass should a separate, explicit production release decision be made.

**Rollback:** Do not delete golfer rows, picks, or scores. If a release is later authorized, capture the deployed SQL definitions and deployment version before changes; prepare a reviewed, reversible rollback for the newly introduced functions and trigger while preserving any legitimately withdrawn golfer state. Never run an unreviewed rollback on the live tournament.

## Production read-only authorization audit — 2026-11-18
- Target: EllenG Cup Supabase project `xepccqedhbucpbwuykoc` only. No SQL writes performed.
- `public.elleng_drafts`: RLS enabled; `authenticated` has SELECT and UPDATE privileges; table owner `postgres`.
- Existing `public.elleng_guard_weighted_roster`: owner `postgres`, `SECURITY INVOKER` (`prosecdef=false`).
- New `elleng_withdraw_golfer` and `elleng_restore_golfer` RPCs are not installed in production.
- Staged guard's `current_user` role check is tested in disposable PostgreSQL. It still needs a real authenticated Supabase/PostgREST rehearsal on a separate environment before release; no live score or roster changes permitted.
- All six executed GitHub CI workflows passed on commit `8462e6c`; two optional workflows skipped. Passing CI does not authorize a merge or deployment.

### Read-only RLS policy verification (2026-11-18)
- Production `public.elleng_drafts` SELECT policy permits authenticated read (`qual=true`).
- UPDATE policy `elleng_owner_update` is restricted to `auth.uid() = owner_id` in **both** USING and WITH CHECK.
- INSERT policies likewise require `auth.uid() = owner_id`.
- These observations are read-only and do not validate PostgREST/RPC end-to-end behavior. No production writes, schema updates, or deployment performed.
