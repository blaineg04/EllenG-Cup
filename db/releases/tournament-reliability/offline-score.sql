-- Additive authenticated offline replay for the two-team individual Shamble.
-- No grants to anon/PUBLIC; no schema or score reset.
CREATE OR REPLACE FUNCTION public.elleng_save_own_offline_score(
 p_draft_id text,p_tournament_id text,p_hole integer,p_score integer,
 p_user_id uuid,p_golfer_index integer,p_team_index integer,p_event_date text,
 p_expected_score integer,p_expected_updated_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_uid uuid:=auth.uid();v_state jsonb;v_draft text;v_count integer;v_idx integer;
 v_date text;v_name text;v_current integer;v_updated timestamptz;v_rows integer;v_memberships integer;
BEGIN
 IF v_uid IS NULL OR v_uid IS DISTINCT FROM p_user_id THEN
  RAISE EXCEPTION 'Original golfer sign-in required' USING ERRCODE='42501';
 END IF;
 IF p_hole IS NULL OR p_hole NOT BETWEEN 1 AND 18 OR (p_score IS NOT NULL AND p_score NOT BETWEEN 1 AND 20)
 OR p_golfer_index IS NULL OR p_golfer_index<0 OR p_team_index IS NULL OR p_team_index NOT BETWEEN 0 AND 1
 OR p_event_date IS NULL OR p_event_date!~'^\d{4}-\d{2}-\d{2}$' THEN
  RAISE EXCEPTION 'Invalid offline score' USING ERRCODE='22023';
 END IF;
 SELECT t.draft_id,t.team_count INTO v_draft,v_count FROM public.elleng_tournaments t
 WHERE t.id=p_tournament_id AND t.status IN ('setup','live') FOR UPDATE;
 IF v_draft IS DISTINCT FROM p_draft_id OR v_count IS DISTINCT FROM 2 THEN
  RAISE EXCEPTION 'Tournament changed; review pending score' USING ERRCODE='40001';
 END IF;
 SELECT d.state,coalesce(d.state->>'tournamentDate',d.tournament_date::text) INTO v_state,v_date
 FROM public.elleng_drafts d WHERE d.id=v_draft FOR SHARE;
 IF v_state->>'playFormat' IS DISTINCT FROM 'shamble_points' OR v_date IS DISTINCT FROM p_event_date THEN
  RAISE EXCEPTION 'Event changed; review pending score' USING ERRCODE='40001';
 END IF;
 SELECT a.golfer_index INTO v_idx FROM public.elleng_player_accounts a
 WHERE a.draft_id=v_draft AND a.user_id=v_uid FOR SHARE;
 v_name:=nullif(btrim(v_state->'golfers'->p_golfer_index->>'name'),'');
 IF v_idx IS DISTINCT FROM p_golfer_index OR v_name IS NULL
 OR coalesce(v_state->'golfers'->p_golfer_index->>'participating','true')='false'
 OR (nullif(v_state->'golfers'->p_golfer_index->>'team','') IS NOT NULL AND v_state->'golfers'->p_golfer_index->>'team' IS DISTINCT FROM p_team_index::text) THEN
  RAISE EXCEPTION 'Golfer assignment changed' USING ERRCODE='40001';
 END IF;
 SELECT count(*) INTO v_memberships FROM jsonb_array_elements(v_state->'teams') WITH ORDINALITY AS t(team,n)
 CROSS JOIN LATERAL jsonb_array_elements(t.team->'roster') AS r(entry)
 WHERE t.n<=2 AND (CASE jsonb_typeof(r.entry) WHEN 'number' THEN r.entry::text WHEN 'object' THEN r.entry->>'golferIndex' ELSE NULL END)=p_golfer_index::text;
 IF v_memberships<>1 OR NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(v_state->'teams'->p_team_index->'roster') AS r(entry)
  WHERE (CASE jsonb_typeof(r.entry) WHEN 'number' THEN r.entry::text WHEN 'object' THEN r.entry->>'golferIndex' ELSE NULL END)=p_golfer_index::text
 ) THEN RAISE EXCEPTION 'Team assignment changed' USING ERRCODE='40001'; END IF;
 SELECT s.score,s.updated_at INTO v_current,v_updated FROM public.elleng_player_hole_scores s
 WHERE s.tournament_id=p_tournament_id AND s.team_index=p_team_index AND s.hole=p_hole AND s.golfer_index=p_golfer_index FOR UPDATE;
 -- A lost acknowledgment may already have saved this exact score. Never write it twice.
 IF v_current IS NOT DISTINCT FROM p_score THEN
  RETURN jsonb_build_object('ok',true,'already_saved',true,'score',v_current,'updated_at',v_updated);
 END IF;
 IF v_current IS DISTINCT FROM p_expected_score OR v_updated IS DISTINCT FROM p_expected_updated_at THEN
  RAISE EXCEPTION 'Newer score exists; review pending score' USING ERRCODE='40001';
 END IF;
 IF p_score IS NULL THEN
  DELETE FROM public.elleng_player_hole_scores s WHERE s.tournament_id=p_tournament_id AND s.team_index=p_team_index
  AND s.hole=p_hole AND s.golfer_index=p_golfer_index AND s.score IS NOT DISTINCT FROM p_expected_score AND s.updated_at IS NOT DISTINCT FROM p_expected_updated_at;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
 ELSIF v_updated IS NULL THEN
  INSERT INTO public.elleng_player_hole_scores(tournament_id,team_index,hole,golfer_index,score,updated_by,updated_at)
  VALUES(p_tournament_id,p_team_index,p_hole,p_golfer_index,p_score,v_uid,clock_timestamp())
  ON CONFLICT(tournament_id,hole,team_index,golfer_index) DO NOTHING;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
 ELSE
  UPDATE public.elleng_player_hole_scores s SET score=p_score,updated_by=v_uid,updated_at=clock_timestamp()
  WHERE s.tournament_id=p_tournament_id AND s.team_index=p_team_index AND s.hole=p_hole AND s.golfer_index=p_golfer_index
  AND s.score IS NOT DISTINCT FROM p_expected_score AND s.updated_at IS NOT DISTINCT FROM p_expected_updated_at;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
 END IF;
 IF v_rows<>1 THEN RAISE EXCEPTION 'Score changed during recovery' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('ok',true,'score',p_score);
END $fn$;
REVOKE ALL ON FUNCTION public.elleng_save_own_offline_score(text,text,integer,integer,uuid,integer,integer,text,integer,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elleng_save_own_offline_score(text,text,integer,integer,uuid,integer,integer,text,integer,timestamptz) TO authenticated;
