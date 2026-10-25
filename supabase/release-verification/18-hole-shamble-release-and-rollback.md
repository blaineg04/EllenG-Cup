# EllenG Cup — 18-hole shamble release and rollback safety

This is a release plan, not proof that the release has been deployed or tested.

## Preflight
1. Confirm the release-branch scoring and visual CI checks are green.
2. Export and verify a restorable backup/snapshot of the Supabase project, including draft, captain, tournament, and all scoring tables.
3. Confirm no active draft, score-entry session, or live tournament is in progress.
4. Confirm the deployed `golfer-handicap` Edge Function version and retain its exact previous source.
5. Inspect the staged SQL migration and read-only verification report.
6. Use isolated test identities and a separate nonproduction database/project for the first authenticated test where available.

## Coordinated change
1. Apply `supabase/migrations/20261024_elleng_18_hole_individual_scores.sql` only after an explicit go decision.
2. Execute `supabase/release-verification/18-hole-shamble-readonly.sql` and verify holes 1–18 are permitted, with zero invalid holes and duplicates.
3. Deploy the versioned `supabase/functions/golfer-handicap/index.ts` function, preserving the prior deployed version for restoration.
4. Test two distinct authenticated golfers from the same team on holes 1 and 10. Verify independently saved scores, no low-ball team-score side effects, and live cumulative 5/4/3/2/1 points.
5. Verify captain/commissioner permissions, unauthorized writes rejected, reconnect/refresh, mobile/desktop standings and broadcast.
6. Promote the verified web build only after all checks pass; confirm production health and exact deployed commit.

## Rollback without data loss
- Stop new writes before restoring a previous Edge Function or web build.
- Preserve and export all individual score rows (especially holes 1–9) before any rollback.
- Restore the previous Edge Function and web deployment together if necessary, then verify roles and reads.
- **Never blindly restore the old CHECK (hole BETWEEN 10 AND 18) constraint.** If any holes 1–9 were entered, that CHECK cannot be re-added without failure or destructive data removal. Keeping the widened 1–18 constraint is backward-compatible with the old function and preserves scores.
- Restore data only from a verified backup after confirming the scope of any corruption, with an explicit operator approval. Do not use TRUNCATE or delete data as a rollback shortcut.
- Document timestamps, exact commit IDs, deployed function versions, test evidence, and operator sign-off.

## Release blockers still open
- Authenticated front/back-nine writes against an isolated test backend.
- Multi-device synchronization of two simultaneous golfer updates.
- Safe spectator access strategy; do not expose account or private golfer data.
- Production backup/restore verification and deployment approval.
