# EllenG Cup Realtime publication review — 2026-10-22

Status: **PROPOSAL ONLY — NOT APPLIED**

Read-only database query verified that `supabase_realtime` currently includes:
`elleng_drafts`, `elleng_team_scores`, `elleng_tournaments`, `elleng_trash_talk`.

The scoring client (`scoring.html`, `subscribeLive()`) also subscribes to:
`elleng_player_hole_scores` and `elleng_pair_hole_scores`. These two tables are missing from the publication.

Both missing tables have RLS enabled; `authenticated` has SELECT and policy `USING (true)`, while `anon` has no matching SELECT policy. This makes individual/pair score changes visible to any authenticated account that can subscribe after publication. Review that audience and score privacy with the commissioner **before** enabling publication.

## Proposed isolated-environment migration (not executed)

```sql
alter publication supabase_realtime add table public.elleng_player_hole_scores;
alter publication supabase_realtime add table public.elleng_pair_hole_scores;
```

Apply only after verifying correct permissions and data exposure on an isolated backend. Confirm both tables appear in `pg_publication_tables`. Test signed-in captain and player updates using isolated records, verify subscription status and cross-device delivery, and verify unauthenticated access is not broadened.

Production rollout needs a separate approved migration and backout plan; do not run these statements automatically. Avoid duplicating already-published tables and keep EllenG Cup separate from FairwayOS.

## Important limitations

Publication membership alone does not guarantee active live updates; browser subscription status, client filters, database permissions and network behavior require authenticated end-to-end tests. The scoring client has a 20-second visible-tab refresh fallback.
