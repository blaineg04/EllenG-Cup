BEGIN;
CREATE OR REPLACE FUNCTION public.elleng_save_own_score_atomic(
 p_draft_id text,p_tournament_id text,p_hole integer,p_score integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_uid uuid:=auth.uid(); v_state jsonb; v_count integer; v_draft text;
 v_golfer integer; v_team integer; v_matches integer:=0; v_i integer; v_idx integer;
 v_roster integer[]; v_entry jsonb; v_team_roster jsonb; v_format text;
 v_pair integer; v_a integer; v_b integer; v_total integer; v_name text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Player sign-in required' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(p_draft_id),'') IS NULL OR nullif(btrim(p_tournament_id),'') IS NULL
 OR p_hole IS NULL OR p_hole NOT BETWEEN 1 AND 18
 OR (p_score IS NOT NULL AND p_score NOT BETWEEN 1 AND 20)
 THEN RAISE EXCEPTION 'Invalid player score request' USING ERRCODE='22023'; END IF;
 -- Same first lock as captain Split-Pair writes; retained until transaction end.
 SELECT t.draft_id,t.team_count INTO v_draft,v_count
 FROM public.elleng_tournaments t WHERE t.id=p_tournament_id AND t.status IN ('setup','live') FOR UPDATE;
 IF v_draft IS DISTINCT FROM p_draft_id OR v_count IS NULL OR v_count<1
 THEN RAISE EXCEPTION 'Tournament unavailable for this draft' USING ERRCODE='42501'; END IF;
 SELECT d.state INTO v_state FROM public.elleng_drafts d WHERE d.id=v_draft FOR SHARE;
 SELECT a.golfer_index INTO v_golfer FROM public.elleng_player_accounts a
 WHERE a.draft_id=v_draft AND a.user_id=v_uid FOR SHARE;
 IF v_golfer IS NULL OR v_golfer<0 OR jsonb_typeof(v_state->'golfers') IS DISTINCT FROM 'array'
 OR v_golfer>=jsonb_array_length(v_state->'golfers')
 OR jsonb_typeof(v_state->'teams') IS DISTINCT FROM 'array'
 OR v_count>jsonb_array_length(v_state->'teams')
 THEN RAISE EXCEPTION 'Player is not linked to this draft' USING ERRCODE='42501'; END IF;
 v_name:=nullif(btrim(v_state->'golfers'->v_golfer->>'name'),'');
 IF v_name IS NULL THEN RAISE EXCEPTION 'Golfer unavailable' USING ERRCODE='42501'; END IF;
 v_format:=coalesce(v_state->>'playFormat','standard');
 IF v_format NOT IN ('standard','elleng','split_pair')
 THEN RAISE EXCEPTION 'Unsupported scoring format' USING ERRCODE='22023'; END IF;
 -- Resolve ownership from the stored roster, never caller-supplied team or golfer.
 FOR v_i IN 0..v_count-1 LOOP
  v_team_roster:=v_state->'teams'->v_i->'roster';
  IF jsonb_typeof(v_team_roster) IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Invalid stored team roster' USING ERRCODE='22023'; END IF;
  v_roster:=ARRAY[]::integer[];
  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_team_roster) LOOP
   IF jsonb_typeof(v_entry)='number' AND v_entry::text ~ '^[0-9]{1,9}$' THEN v_idx:=(v_entry::text)::integer;
   ELSIF jsonb_typeof(v_entry)='object' AND (v_entry->>'golferIndex') ~ '^[0-9]{1,9}$'
   THEN v_idx:=(v_entry->>'golferIndex')::integer;
   ELSE RAISE EXCEPTION 'Invalid roster golfer' USING ERRCODE='22023'; END IF;
   IF v_idx>=jsonb_array_length(v_state->'golfers') OR v_idx=ANY(v_roster)
   OR nullif(btrim(v_state->'golfers'->v_idx->>'name'),'') IS NULL
   THEN RAISE EXCEPTION 'Invalid or duplicate roster golfer' USING ERRCODE='22023'; END IF;
   v_roster:=array_append(v_roster,v_idx);
  END LOOP;
  IF v_golfer=ANY(v_roster) THEN
   v_matches:=v_matches+1;v_team:=v_i;
   IF v_format='split_pair' AND cardinality(v_roster)<>4
   THEN RAISE EXCEPTION 'Four drafted golfers required' USING ERRCODE='22023'; END IF;
   v_pair:=CASE WHEN array_position(v_roster,v_golfer)<=2 THEN 0 ELSE 1 END;
  END IF;
 END LOOP;
 IF v_matches<>1 THEN RAISE EXCEPTION 'Player must belong to exactly one active team' USING ERRCODE='42501'; END IF;
 -- Explicit golfer.team must agree with the roster when present.
 IF nullif(v_state->'golfers'->v_golfer->>'team','') IS NOT NULL
 AND v_state->'golfers'->v_golfer->>'team' IS DISTINCT FROM v_team::text
 THEN RAISE EXCEPTION 'Player team assignment is inconsistent' USING ERRCODE='42501'; END IF;
 IF v_format='split_pair' THEN
  IF p_score IS NULL THEN
   DELETE FROM public.elleng_pair_hole_scores WHERE tournament_id=p_tournament_id AND team_index=v_team AND hole=p_hole AND pair_index=v_pair;
  ELSE
   INSERT INTO public.elleng_pair_hole_scores(tournament_id,team_index,hole,pair_index,score,updated_by,updated_at)
   VALUES(p_tournament_id,v_team,p_hole,v_pair,p_score,v_uid,now())
   ON CONFLICT(tournament_id,hole,team_index,pair_index) DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  END IF;
  SELECT max(score) FILTER(WHERE pair_index=0),max(score) FILTER(WHERE pair_index=1) INTO v_a,v_b
  FROM public.elleng_pair_hole_scores WHERE tournament_id=p_tournament_id AND team_index=v_team AND hole=p_hole;
  IF v_a BETWEEN 1 AND 20 AND v_b BETWEEN 1 AND 20 THEN
   v_total:=v_a+v_b;
   INSERT INTO public.elleng_team_scores(tournament_id,team_index,hole,score,updated_by,updated_at)
   VALUES(p_tournament_id,v_team,p_hole,v_total,v_uid,now())
   ON CONFLICT(tournament_id,team_index,hole) DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  ELSE
   DELETE FROM public.elleng_team_scores WHERE tournament_id=p_tournament_id AND team_index=v_team AND hole=p_hole;
  END IF;
  RETURN jsonb_build_object('ok',true,'mode','split_pair','team_index',v_team,'pair_index',v_pair,'golfer_name',v_name,'score',p_score,'team_score',v_total);
 END IF;
 -- Standard My Score stores individual 18-hole strokes; preserve existing low-ball semantics.
 IF p_score IS NULL THEN
  DELETE FROM public.elleng_player_hole_scores WHERE tournament_id=p_tournament_id AND team_index=v_team AND hole=p_hole AND golfer_index=v_golfer;
 ELSE
  INSERT INTO public.elleng_player_hole_scores(tournament_id,team_index,hole,golfer_index,score,updated_by,updated_at)
  VALUES(p_tournament_id,v_team,p_hole,v_golfer,p_score,v_uid,now())
  ON CONFLICT(tournament_id,hole,team_index,golfer_index) DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 END IF;
 RETURN jsonb_build_object('ok',true,'mode','player_shamble','team_index',v_team,'golfer_name',v_name,'score',p_score);
END $fn$;
ALTER FUNCTION public.elleng_save_own_score_atomic(text,text,integer,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.elleng_save_own_score_atomic(text,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.elleng_save_own_score_atomic(text,text,integer,integer) TO authenticated;
COMMIT;
