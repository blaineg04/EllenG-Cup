# Hosted scoring schema reconciliation — 2026-10-29

**READ-ONLY observations from EllenG Supabase project xepccqedhbucpbwuykoc. Not a deployment approval.**

- Three live scoring tables have RLS enabled and authenticated direct INSERT/UPDATE/DELETE grants; no custom scoring triggers.
- Four proposed scoring RPCs (Scramble, Split-Pair, Shamble, commissioner reset) are absent in the hosted database.
- All three currently enforce a 1–20 score range. The proposed Split-Pair format needs a coordinated range change.
- Existing Shamble team write policies contain fixed `draft_id = 'elleng-cup'` references; use tournament-linked draft authorization before deployment.
- Existing score policies include separate broad active-tournament INSERT/UPDATE/DELETE checks and team/captain ownership policies. Merely enabling RLS does not guarantee restricted score writes: the existing permissive policy combinations require review.
- A direct-write grant removal must be coordinated with the RPC-compatible scoring client or scoring will stop working.

## Blocking release review
1. Confirm existing constraints and policy definitions match the review-only migration's DROP/CREATE statements exactly, and that all score-read paths remain functional.
2. Confirm trusted SECURITY DEFINER ownership, execution ACL, dependencies and locked search_path using the hosted roles and schema.
3. Capture approved production backup and perform a restore drill; isolated GitHub CI restores are not evidence of hosted recovery.
4. Freeze exact executable SQL and SHA-256 plus matching client release, maintenance window, monitoring and rollback instructions.
5. Obtain explicit approval before *any* live SQL or production deployment. Authenticate captain and commissioner on two devices after deployment.

Source: read-only catalog queries against pg_constraint, pg_policies, pg_proc, pg_class and pg_trigger on 2026-10-29; no row-level personal data accessed or changed.
