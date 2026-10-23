# EllenG Cup app-only deployment compatibility — 2026-10-22

**Read-only verification. No production deploy, SQL migration, or tournament write.**

## Verified against live Supabase metadata
Project `xepccqedhbucpbwuykoc`:
- `elleng_drafts`: `id, owner_id, state, updated_at, tournament_name, tournament_date, status, created_at`; RLS enabled.
- `elleng_captains`: `draft_id, user_id, team_index, captain_name, captain_email`; RLS enabled.
- `elleng_team_scores`: `tournament_id, team_index, hole, score, updated_by, updated_at`; RLS enabled.
- `elleng_player_hole_scores`: `tournament_id, hole, team_index, golfer_index, score, updated_by, updated_at`; RLS enabled.
- `elleng_pair_hole_scores`: `tournament_id, hole, team_index, pair_index, score, updated_by, updated_at`; RLS enabled.
- Deployed security-definer RPC signatures: `elleng_make_pick(p_draft_id text,p_golfer_index integer)`, `elleng_auto_pick(p_draft_id text)`, `elleng_save_state_if_fresh(p_draft_id text,p_expected_updated_at timestamptz,p_state jsonb)`.

These match the principal table/RPC names expected by the proposed captain/draft runtime. **This is a schema and signature preflight, not a verified end-to-end authenticated test.**

## Important distinction: app-only vs. Realtime feature completion
- The proposed PR #6 app changes in `captain.html`, `common.js`, `draft.html`, `scoring.html` can be staged without executing `supabase.sql` or the proposed migration.
- Read-only earlier checks found `elleng_player_hole_scores` and `elleng_pair_hole_scores` absent from the `supabase_realtime` publication. The scoring page may use those change subscriptions; without the migration, some per-player or pair live score updates may not broadcast. Refresh/reconnect behavior alone does **not** fix missing publication membership.
- The publication proposal has privacy implications because score-row SELECT policies differ for anonymous/authenticated viewers. **Do not apply it automatically.**
- No evidence yet that the app-only candidate is fully operational for the November 20 tournament.

## App-only staging recommendation
1. Review integrated runtime diff from PRs #1 → #4 → #6 against `main`.
2. Produce a release candidate branch without running database migrations.
3. Rerun scoring, disposable PostgreSQL acceptance, and current-SHA visual matrix.
4. Validate commissioner/captain auth and Realtime in a truly isolated environment; no test picks against `elleng-cup` production draft.
5. Confirm production baseline deployment `dpl_FbiibvrkEcsYBvT6EojMxxrtNwYs` and documented rollback operation before approval.

**NO-GO for production right now**; read-only metadata compatibility is encouraging but does not clear authentication, publication, or rollback gates.
