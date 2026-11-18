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
