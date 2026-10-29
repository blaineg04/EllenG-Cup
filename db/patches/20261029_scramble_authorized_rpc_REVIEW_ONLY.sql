-- REVIEW ONLY: validated standard front-nine Scramble scoring.
-- Install only in one approved migration with score-table permission lockdown.
CREATE OR REPLACE FUNCTION public.elleng_test_authorized_scramble(
 p_tournament_id text,p_team_index integer,p_hole integer,p_score integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
 v_uid uuid := auth.uid();
 v_draft text;
 v_state jsonb;
 v_owner uuid;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_tournament_id IS NULL OR btrim(p_tournament_id)=''
  OR p_team_index IS NULL OR p_team_index<0
  OR p_hole IS NULL OR p_hole NOT BETWEEN 1 AND 9
  OR (p_score IS NOT NULL AND p_score NOT BETWEEN 1 AND 20)
 THEN RAISE EXCEPTION 'Invalid Scramble score' USING ERRCODE='22023'; END IF;
 SELECT t.draft_id INTO v_draft
 FROM public.elleng_tournaments t
 WHERE t.id=p_tournament_id AND t.status IN ('setup','live')
   AND p_team_index<t.team_count FOR UPDATE;
 IF v_draft IS NULL THEN RAISE EXCEPTION 'Tournament unavailable' USING ERRCODE='42501'; END IF;
 SELECT d.owner_id,d.state INTO v_owner,v_state
 FROM public.elleng_drafts d WHERE d.id=v_draft FOR SHARE;
 IF v_owner IS NULL OR v_state IS NULL THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501'; END IF;
 IF v_uid IS DISTINCT FROM v_owner AND NOT EXISTS (
  SELECT 1 FROM public.elleng_captains c
  WHERE c.draft_id=v_draft AND c.user_id=v_uid AND c.team_index=p_team_index
 ) THEN RAISE EXCEPTION 'Not authorized to score team' USING ERRCODE='42501'; END IF;
 IF coalesce(v_state->>'playFormat','standard') NOT IN ('standard','elleng')
 THEN RAISE EXCEPTION 'Scramble format not selected' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(v_state->'teams') IS DISTINCT FROM 'array'
   OR p_team_index>=jsonb_array_length(v_state->'teams')
 THEN RAISE EXCEPTION 'Team not drafted' USING ERRCODE='22023'; END IF;
 IF p_score IS NULL THEN
  DELETE FROM public.elleng_team_scores
  WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole;
 ELSE
  INSERT INTO public.elleng_team_scores(tournament_id,team_index,hole,score,updated_by,updated_at)
  VALUES(p_tournament_id,p_team_index,p_hole,p_score,v_uid,now())
  ON CONFLICT(tournament_id,team_index,hole)
  DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=now();
 END IF;
 RETURN p_score;
END;
$fn$;
REVOKE ALL ON FUNCTION public.elleng_test_authorized_scramble(text,integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elleng_test_authorized_scramble(text,integer,integer,integer) TO authenticated;
