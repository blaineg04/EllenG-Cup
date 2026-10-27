-- ISOLATED DESIGN ONLY. Not deployed, not a migration.
-- Caller roster removed. Authorization and roster must come from trusted
-- tournament -> draft state and captain rows.
CREATE OR REPLACE FUNCTION public.elleng_test_authorized_shamble(
 p_tournament_id text, p_team_index integer, p_hole integer,
 p_golfer_index integer, p_score integer
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
 v_uid uuid := auth.uid();
 v_draft text;
 v_state jsonb;
 v_roster integer[];
 v_low integer;
 v_count integer;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_tournament_id IS NULL OR p_team_index IS NULL OR p_team_index NOT BETWEEN 0 AND 8
  OR p_hole NOT BETWEEN 10 AND 18 OR p_golfer_index IS NULL OR p_golfer_index<0
  OR (p_score IS NOT NULL AND p_score NOT BETWEEN 1 AND 20)
 THEN RAISE EXCEPTION 'Invalid scoring input' USING ERRCODE='22023'; END IF;
 SELECT t.draft_id,d.state INTO v_draft,v_state
 FROM public.elleng_tournaments t
 JOIN public.elleng_drafts d ON d.id=t.draft_id
 WHERE t.id=p_tournament_id AND t.status IN ('setup','live')
   AND p_team_index<t.team_count
   AND (d.owner_id=v_uid OR EXISTS(
     SELECT 1 FROM public.elleng_captains c
     WHERE c.draft_id=d.id AND c.team_index=p_team_index AND c.user_id=v_uid
   ));
 IF v_draft IS NULL THEN RAISE EXCEPTION 'Not authorized for this team' USING ERRCODE='42501'; END IF;
 -- Authoritative roster from stored draft, not client-supplied data.
 -- Current browser roster entries may be integers or {golferIndex: integer}.
 -- Invalid entries and duplicates fail closed rather than shrinking the team.
 IF jsonb_typeof(v_state->'teams'->p_team_index->'roster') <> 'array'
 THEN RAISE EXCEPTION 'Invalid stored roster' USING ERRCODE='22023'; END IF;
 SELECT array_agg(CASE
   WHEN jsonb_typeof(entry)='number' AND (entry::text ~ '^[0-9]+ THEN RAISE EXCEPTION 'Golfer not assigned to team' USING ERRCODE='42501'; END IF;
 -- Every writer must obtain the same tournament lock before mutation.
 PERFORM 1 FROM public.elleng_tournaments t
 WHERE t.id=p_tournament_id FOR UPDATE;
 IF p_score IS NULL THEN
  DELETE FROM public.elleng_player_hole_scores
  WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole AND golfer_index=p_golfer_index;
 ELSE
  INSERT INTO public.elleng_player_hole_scores(tournament_id,hole,team_index,golfer_index,score,updated_by,updated_at)
  VALUES(p_tournament_id,p_hole,p_team_index,p_golfer_index,p_score,v_uid,now())
  ON CONFLICT(tournament_id,hole,team_index,golfer_index)
  DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 END IF;
 SELECT count(*),min(score) INTO v_count,v_low FROM public.elleng_player_hole_scores
 WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole
   AND golfer_index=ANY(v_roster);
 IF v_count<>cardinality(v_roster) THEN
  DELETE FROM public.elleng_team_scores WHERE tournament_id=p_tournament_id
    AND team_index=p_team_index AND hole=p_hole;
  RETURN NULL;
 END IF;
 INSERT INTO public.elleng_team_scores(tournament_id,team_index,hole,score,updated_by,updated_at)
 VALUES(p_tournament_id,p_team_index,p_hole,v_low,v_uid,now())
 ON CONFLICT(tournament_id,team_index,hole)
 DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 RETURN v_low;
END $fn$;
REVOKE ALL ON FUNCTION public.elleng_test_authorized_shamble(text,integer,integer,integer,integer) FROM PUBLIC;
-- No GRANT added. RLS must be corrected and authenticated fixture executed before usage.
) THEN (entry::text)::integer
   WHEN jsonb_typeof(entry)='object' AND (entry->>'golferIndex' ~ '^[0-9]+ THEN RAISE EXCEPTION 'Golfer not assigned to team' USING ERRCODE='42501'; END IF;
 -- Every writer must obtain the same tournament lock before mutation.
 PERFORM 1 FROM public.elleng_tournaments t
 WHERE t.id=p_tournament_id FOR UPDATE;
 IF p_score IS NULL THEN
  DELETE FROM public.elleng_player_hole_scores
  WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole AND golfer_index=p_golfer_index;
 ELSE
  INSERT INTO public.elleng_player_hole_scores(tournament_id,hole,team_index,golfer_index,score,updated_by,updated_at)
  VALUES(p_tournament_id,p_hole,p_team_index,p_golfer_index,p_score,v_uid,now())
  ON CONFLICT(tournament_id,hole,team_index,golfer_index)
  DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 END IF;
 SELECT count(*),min(score) INTO v_count,v_low FROM public.elleng_player_hole_scores
 WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole
   AND golfer_index=ANY(v_roster);
 IF v_count<>cardinality(v_roster) THEN
  DELETE FROM public.elleng_team_scores WHERE tournament_id=p_tournament_id
    AND team_index=p_team_index AND hole=p_hole;
  RETURN NULL;
 END IF;
 INSERT INTO public.elleng_team_scores(tournament_id,team_index,hole,score,updated_by,updated_at)
 VALUES(p_tournament_id,p_team_index,p_hole,v_low,v_uid,now())
 ON CONFLICT(tournament_id,team_index,hole)
 DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 RETURN v_low;
END $fn$;
REVOKE ALL ON FUNCTION public.elleng_test_authorized_shamble(text,integer,integer,integer,integer) FROM PUBLIC;
-- No GRANT added. RLS must be corrected and authenticated fixture executed before usage.
) THEN (entry->>'golferIndex')::integer
   ELSE NULL END)
 INTO v_roster
 FROM jsonb_array_elements(v_state->'teams'->p_team_index->'roster') entry;
 IF v_roster IS NULL OR cardinality(v_roster)=0
    OR array_position(v_roster,NULL) IS NOT NULL
    OR cardinality(v_roster)<>(SELECT count(DISTINCT golfer) FROM unnest(v_roster) golfer)
    OR p_golfer_index<>ALL(v_roster)
 THEN RAISE EXCEPTION 'Golfer not assigned to team' USING ERRCODE='42501'; END IF;
 -- Every writer must obtain the same tournament lock before mutation.
 PERFORM 1 FROM public.elleng_tournaments t
 WHERE t.id=p_tournament_id FOR UPDATE;
 IF p_score IS NULL THEN
  DELETE FROM public.elleng_player_hole_scores
  WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole AND golfer_index=p_golfer_index;
 ELSE
  INSERT INTO public.elleng_player_hole_scores(tournament_id,hole,team_index,golfer_index,score,updated_by,updated_at)
  VALUES(p_tournament_id,p_hole,p_team_index,p_golfer_index,p_score,v_uid,now())
  ON CONFLICT(tournament_id,hole,team_index,golfer_index)
  DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 END IF;
 SELECT count(*),min(score) INTO v_count,v_low FROM public.elleng_player_hole_scores
 WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole
   AND golfer_index=ANY(v_roster);
 IF v_count<>cardinality(v_roster) THEN
  DELETE FROM public.elleng_team_scores WHERE tournament_id=p_tournament_id
    AND team_index=p_team_index AND hole=p_hole;
  RETURN NULL;
 END IF;
 INSERT INTO public.elleng_team_scores(tournament_id,team_index,hole,score,updated_by,updated_at)
 VALUES(p_tournament_id,p_team_index,p_hole,v_low,v_uid,now())
 ON CONFLICT(tournament_id,team_index,hole)
 DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 RETURN v_low;
END $fn$;
REVOKE ALL ON FUNCTION public.elleng_test_authorized_shamble(text,integer,integer,integer,integer) FROM PUBLIC;
-- No GRANT added. RLS must be corrected and authenticated fixture executed before usage.
