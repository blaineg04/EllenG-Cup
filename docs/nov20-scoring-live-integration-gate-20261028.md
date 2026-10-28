# EllenG scoring integration rollout gate — review only

**Target:** existing EllenG Supabase project `xepccqedhbucpbwuykoc`. Never FairwayOS.

## Verified observations (2026-10-28)
- Live `elleng_pair_hole_scores`, `elleng_player_hole_scores`, and `elleng_team_scores` have RLS enabled (read-only catalog query).
- Live `public.elleng_test_authorized_split_pair` and `public.elleng_test_authorized_shamble` are **absent** (read-only pg_proc query).
- The existing draft/scoring browser client references these RPC names. Successful isolated fixtures do not prove hosted auth/RLS/Realtime.
- Disposable PostgreSQL acceptance and scoring integrity CI are green at workflow runs 580 and 649, respectively.

## Explicit blockers before any live changes
1. Review exact staged SQL, ownership, execute grants, `auth.uid()` authorization, tournament status and team-index restrictions. Split-Pair uses SECURITY DEFINER and must receive particularly careful privilege and search-path review.
2. Confirm live `elleng_team_scores.score` CHECK currently supports Split-Pair's possible 40 total; stage a safe constraint change if needed. Verify no regression to standard 1–20 scoring paths.
3. Validate RLS for direct writes to all score tables. Ensure RPC-only writes cannot be bypassed by authenticated table DML or an unintended broad permissive policy.
4. Capture current schema-only backup, validate the rollback SQL and preserve existing tournament records. Check active play and permissions before the rollout window.
5. Obtain explicit approval before *any* production SQL write, migration or policy change.
6. After approved installation, use only authorized dedicated test accounts and an approved disposable tournament fixture, never actual November 20 scores. Verify two-device updates, rejection of unauthorized team updates, clears and resume, and Realtime refresh. Remove only approved temporary fixture records.
7. Require strict `tests/acceptance/scoring-deployment-preflight.sql` and a fresh MacBook seven-width rehearsal before declaring production ready.

## Safe next steps now
- Continue running native disposable PostgreSQL acceptance and MacBook Playwright, without Docker.
- Review live schema/functions/policies via **SELECT** statements only; no migrations.
- Keep the new optional isolated-project authentication workflow untriggered; an additional Supabase project is **not required**.
- Keep all proposed SQL in version control for review, separate from production.

**Status:** GO for local-only validation. NO-GO for live scoring RPC rollout pending the blockers and approval above.
