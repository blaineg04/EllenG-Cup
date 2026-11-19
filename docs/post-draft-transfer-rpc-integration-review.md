# Transfer RPC integration findings (2026-11-19; READ ONLY REVIEW)

Inspected `db/releases/player-participation/status.sql` and `docs/post-draft-withdrawal-contract.md`. This is not a migration.

- Draft state is stored in `public.elleng_drafts.state` as JSONB. Golfer assignments are represented in both `state.golfers[index].team` and `state.teams[index].roster`; the transfer must update both in one transaction.
- Existing participation RPC locks `elleng_tournaments` before `elleng_drafts`, verifies `auth.uid() = owner_id`, checks `updated_at`, and checks score tables `elleng_team_scores`, `elleng_player_hole_scores`, and `elleng_pair_hole_scores`.
- Existing participation RPC deliberately refuses changes once picks/assignments exist; **do not reuse or relax it** to implement post-draft transfers.
- Weighted-roster guard trigger requires a separately reviewed, narrowly scoped authorized transfer path. Avoid generic bypass, disabling the trigger, or client-side draft saves.
- A source-file review cannot establish the currently deployed trigger or scoring RPC definition. Inspect actual definitions read-only before writing transfer SQL. Production score RPC `elleng_test_authorized_shamble` and row-level policies require specific authorization review.
- No production transfer SQL should be installed, and no live tournament writes should be used for testing. Use existing disposable PostgreSQL GitHub Actions service and real authenticated API tests in safe non-production infrastructure before release.

## Next implementation gate
1. Read actual draft JSON schema and weighted-roster guard source, including captain representation, completion marker, roster entry shape, and any scoring triggers.
2. Stage an **additive** SECURITY DEFINER transfer RPC, strict explicit grants, transaction lock order, stale-revision guard, and scoring gate.
3. Validate moves and swaps against disposable PostgreSQL fixtures and the existing simulator, then run authenticated API and two-device mobile tests.
4. Obtain separate approval before merging or deploying. The November 20 tournament is protected from these experimental changes.
