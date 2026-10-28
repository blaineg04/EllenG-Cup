# Live schema compatibility review — October 28, 2026

**Read-only audit. No changes applied to Supabase.** Project: EllenG Cup `xepccqedhbucpbwuykoc`. Do not copy these changes into FairwayOS.

## Verified catalog facts
- `elleng_tournaments` contains `id`, `draft_id`, `status`, `team_count`.
- `elleng_drafts` contains `owner_id`, `state`; `elleng_captains` contains `draft_id`, `user_id`, `team_index`.
- Player, pair and team scoring tables contain the columns the staged RPCs expect; their composite primary keys support the proposed ON CONFLICT clauses.
- Live `elleng_pair_hole_scores.score` and `elleng_player_hole_scores.score` permit 1–20; live `elleng_team_scores.score` also permits **1–20**, so Split-Pair combined scores up to 40 cannot be installed independently of a reviewed constraint and format-aware write gate.
- RLS is enabled on all three score tables and existing policies include restrictive *active tournament* guards.
- Existing permissive INSERT/UPDATE/DELETE policies **also allow direct team/individual score table writes** by authorized users, subject to the restrictive active-event guards. They do not require a scoring RPC. Consequently, an RPC-only aggregate rule can be bypassed unless direct write paths are safely migrated or restricted.
- The current Shamble player-score policies contain an explicit fixed draft ID `elleng-cup`. The proposed RPC derives authorization using `t.draft_id`. This is an inconsistency for variable tournament IDs and may prevent SECURITY INVOKER writes or allow unintended scope. Review and test with multiple draft IDs before rollout.
- `public.elleng_test_authorized_split_pair` and `public.elleng_test_authorized_shamble` are absent.

## No-go issues
1. The existing 20-point team CHECK must not simply be widened. Standard team score writes could then accept up to 40 through existing direct table permissions. Add server-side format-aware enforcement or a carefully validated RPC-only architecture first.
2. Review the staged Split-Pair SECURITY DEFINER function owner, effective search path, GRANT/REVOKE, caller identity, tournament and team authorization. Independent approval required.
3. Shamble SECURITY INVOKER depends on existing authenticated SQL role grants and RLS policies. Replace hard-coded draft matching with a tournament-associated policy *only after* disposable role tests, including unrelated tournament IDs and unauthorized team attempts.
4. Existing browser score writes and automatic team total derivation must be reconciled in one rollout. Direct writes must not be disabled until standard-format and fallback paths are proven compatible.
5. Back up schema and data, dry-run rollback and hold a scheduled tournament-safe maintenance window. Do not deploy before explicit approval.

## Next safe development
Build disposable PostgreSQL regression covering two draft IDs, forged authorized direct score-table writes, active-status guards, failed unauthorized scoring and 1–40 Split-Pair range, while retaining existing standard-format 1–20 limits. Separately confirm MacBook browser simulations on seven widths.

**Overall status:** local CI GO; hosted scoring RPC rollout NO-GO. No second Supabase project required for continued local testing.
