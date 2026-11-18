# November 20: late golfer enrollment after completed draft

Status: **staged only — not deployed or applied to production**.

## Request
Commissioner needs to add Maxwell LeBeouf (band C) as **Playing**, assigned to **Team 2**, for November 20 after the live draft has completed. Do not reopen/reset the draft, change captains, reorder picks, change any existing roster member, or touch scoring records.

## Verified existing implementation
- `Scoring.html` currently adds golfers by modifying `draftState.golfers`, expanding `golferCount` and possibly team count, then calling `elleng_save_state_if_fresh`. This is not suitable for a completed draft.
- `db/releases/player-participation/status.sql` explicitly refuses adding Playing golfers outside setup and when picks exist. **Do not remove those protections from the general participation RPC.**
- Scoring rows reference `golfer_index`; preserving every existing index is mandatory.

## Implementation gate (before production)
1. Add a **new** commissioner-only `elleng_add_late_golfer` RPC, not a bypass in existing draft/participation functions.
2. Authenticate via `auth.uid()` and current `elleng_drafts.owner_id`; lock tournament then draft in established order, and compare expected `updated_at` to prevent overwriting concurrent changes.
3. Permit only an existing, active tournament after a completed draft, before scores begin; reject completed/archived tournaments and any recorded scores. Confirm actual draft completion using authoritative draft state, not merely a client flag.
4. Validate name, handicap/band, destination team index, player uniqueness, free slot/account reservation, team roster structure, and the live two-team shamble format.
5. Update only the newly appended golfer and Team 2 roster in the draft JSON, keeping every previous golfer index, pick, team assignment, captain, draft rule and score row identical. Do not recompute balanced draft or team count.
6. Preserve eligibility semantics (`participating: true`, proper team assignment), and provision/link player account using the existing secured account workflow without duplicate accounts.
7. Return the new index and updated timestamp; refresh client state and verify Players, Teams, My Score, and leaderboard on two authenticated devices.
8. Add negative tests for unauthenticated and noncommissioner calls, stale timestamps, duplicate golfer, full roster, wrong team, existing scores, draft in progress, and repeated submission.
9. Run disposable-database integration tests, capture a verified backup/rollback, and deploy only after review. **Never test writes on the live November 20 roster.**

## UI
Keep current Add Golfer workflow for setup. When draft is completed, show a clearly labeled **Add Late Golfer** commissioner-only action that calls the new scoped RPC; require a confirmation showing name, tournament date, and team. Fail closed if the RPC is unavailable. No client-side full draft save fallback.

## Production acceptance
- Maxwell LeBeouf appears exactly once under Team 2 and Playing.
- All existing team rosters, captain assignments, picks, and scores are byte-for-byte unchanged.
- New golfer can authenticate and enter scores; other golfers can see his score.
- Current November 20 production layout remains unchanged except the new commissioner control.
