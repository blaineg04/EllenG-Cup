-- READ ONLY. Run before authorizing any post-draft transfer deployment.
-- This does not change scores, draft, rosters, or permissions.
SELECT
 d.id AS draft_id,
 t.id AS tournament_id,
 t.status AS tournament_status,
 d.state->>'draftRules' AS draft_rules,
 d.updated_at AS draft_revision,
 jsonb_array_length(coalesce(d.state->'picks','[]'::jsonb)) AS pick_count,
 (SELECT count(*) FROM jsonb_array_elements(d.state->'golfers') g
  WHERE btrim(coalesce(g->>'name',''))<>'' AND g->>'team' IN ('0','1')
    AND coalesce((g->>'late_added')::boolean,false)=false) AS original_assigned_count,
 (SELECT count(*) FROM public.elleng_group_assignments WHERE draft_id=d.id) AS saved_pairings,
 (SELECT count(*) FROM public.elleng_player_hole_scores WHERE tournament_id=t.id) AS player_score_rows,
 (SELECT count(*) FROM public.elleng_team_scores WHERE tournament_id=t.id) AS team_score_rows,
 (SELECT count(*) FROM public.elleng_pair_hole_scores WHERE tournament_id=t.id) AS pair_score_rows,
 (SELECT count(*) FROM pg_trigger
  WHERE tgrelid='public.elleng_drafts'::regclass AND NOT tgisinternal
  AND tgfoid='public.elleng_guard_weighted_roster()'::regprocedure) AS weighted_guard_count
FROM public.elleng_drafts d
JOIN public.elleng_tournaments t ON t.draft_id=d.id
WHERE d.id='elleng-cup' AND t.id='elleng-cup-live';
