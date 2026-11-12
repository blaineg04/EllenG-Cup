# Fair Draft v2 controlled release — November 20 EllenG Cup

## Verified baseline (2026-11-12, read-only)
- Production draft `elleng-cup` is paused, `balanceVersion=1`, with exactly two seeded captain picks and zero ordinary picks.
- Team 1: Carl LeMaire (B); Team 2: Jarad Jones (A).
- 23 participating golfers, zero unranked, zero invalid handicap bands, zero duplicate participating names.
- The v2 SQL preparation and turn functions are **not** installed on production.
- This document is a checklist, **not** authorization to change live data.

## Release gates
1. Verify all executed PR #72 CI workflows pass on the **current head SHA**; record the SHA. The synthetic responsive workflow may be skipped, but the MacBook isolated seven-width rehearsal must pass.
2. Confirm the live draft remains paused, has exactly two captain picks, no ordinary picks, and the expected captain handicaps. Stop if any baseline differs.
3. Review and approve the four versioned SQL migrations `20261112000002` through `20261112000005`. Apply them **in ascending order** in a controlled production change window; no production draft-state updates during migration.
4. Verify SQL function existence, execution grants, and that the legacy version-1 path remains usable. Stop on any mismatch.
5. Merge and deploy the reviewed application changes only after the required SQL functions exist. Confirm the deployed application serves `captain-fairness.js`, `weighted-draft.js`, and the updated `admin.html` and `common.js`.
6. Sign in as commissioner and verify **Prepare Fair Draft (v2)** is visible, but **do not click it** during deployment verification. Confirm the existing draft is still paused and at version 1.
7. At the commissioner's explicit decision to adopt v2, use the opt-in control once. Verify the resulting version is 2, the draft remains paused, both captain picks and rosters are intact, and no ordinary pick was made. Do not begin picks until this post-opt-in verification passes.
8. Run a two-account authorized captain/commissioner smoke test in an **isolated draft**, not on the tournament draft, including a denied wrong-team pick. Do not create or mutate live tournament selections for testing.

## Stop / rollback conditions
- Any ordinary pick already exists, captain mismatch, unexpected version change, failed SQL acceptance, missing RPC, or unauthorized operation: **stop** and preserve the draft state.
- Application rollback may return to the previous build, but database migrations are not automatically reversed. Do not downgrade or rewrite a prepared v2 draft to version 1.
- Do not reset the live draft to repair a failed rollout. Investigate logs and reverify state first.
- Keep the live draft paused until commissioner confirms the start.

## Odd-team scoring
For 23 golfers the weaker captain's team has 12 players and the stronger captain's team has 11. Official scoring must compare **per-golfer average points** (including applicable Gator Hole bonus treatment), not raw team sums.
