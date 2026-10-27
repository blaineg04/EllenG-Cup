# Atomic Shamble scoring — schema-verified design (NOT FOR PRODUCTION)

Status: **BLOCKED for deployment**. This review uses read-only inspection of EllenG Cup Supabase project `xepccqedhbucpbwuykoc` on October 26, 2026. **No SQL was applied, no live scores were modified.**

## Verified database
- `public.elleng_player_hole_scores`: composite PK `(tournament_id,hole,team_index,golfer_index)`, integer score 1–20; hole 1–18; `updated_by uuid`.
- `public.elleng_team_scores`: composite PK `(tournament_id,team_index,hole)`, nullable integer score 1–20; hole 1–18; FK `tournament_id` → tournaments.
- Both are in exposed `public` schema with policies for authenticated users.
- **Security blocker:** Both tables have additional broad `active live ... guard` INSERT/UPDATE/DELETE policies that only check tournament status and team-index range. PostgreSQL permissive policies combine with OR. These policies can allow authenticated users to modify other teams' scores despite separately defined captain/commissioner policies. Inspect and correct authorization on an isolated clone before implementing an exposed RPC; never assume the restrictive-looking additional policies enforce access.
- The score rows do not encode the required golfer roster size. Obtain roster information from a verified draft snapshot and enforce the actual registration/eligibility rules.

## Required design for safe cross-device saves
1. Choose one server-side entry point: `save_shamble_score(tournament_id,team_index,hole,golfer_index,score_or_null)`.
2. Validate `auth.uid()`, draft association, commissioner/team-captain authorization, roster ownership, current tournament status, back-nine hole 10–18, and legal strokes 1–20. A missing score means delete; never infer it from JavaScript number conversion.
3. In a **single database transaction**, acquire a lock shared by all saves for the same `(tournament,team,hole)`. Locking only an existing team-score row is inadequate because it may not yet exist. A per-transaction advisory lock with a collision-safe mapping or a locked canonical tournament/team row can serialize the entire read/write/recalculate operation. Document lock order.
4. Upsert/delete the player row and recalculate team low ball from **committed, complete, authorized roster entries** while holding the lock. If incomplete, delete the derived team score; if complete, upsert the minimum. Never trust stale browser snapshots for the calculation.
5. Commit both changes together; no intermediate display of a false team score, and rollback both on failure. Concurrent calls must converge to the latest correct team score.
6. Remove the browser-side second write after the RPC passes isolated tests. Preserve the existing front-nine scramble and split-pair code paths. Ensure existing personal-score authorization is not bypassed.
7. Avoid default PUBLIC EXECUTE permissions on privileged functions. Prefer `SECURITY INVOKER` where authorization and row policies support it. If a privileged function is unavoidable, require an explicit, audited privilege model with hardened `search_path` and least-privilege grants; do not expose unrestricted privileged RPCs.

## Required isolated acceptance
- Two clients update distinct golfers on one hole with adversarial ordering: official low ball must be 2, not stale 3.
- Concurrent clear and save; incomplete roster clears derived score.
- Unauthorized golfer/captain or other-team edits rejected; signed-out and wrong-draft requests rejected.
- One/partial roster, holes 9/10/18/19, invalid scores, reconnect, and idempotent repeated submissions.
- Existing scoring regression, draft regressions, seven-width visuals and authenticated device rehearsal against isolated backend.
- Verify hosted backup and rollback independently before any production migration.

**Current demonstration:** `tests/shamble-cross-device-race-characterization.test.cjs` reproduces 3 instead of 2; the CI gate is required and red. This document does not fix the race by itself.
