-- REVIEW ONLY. Do not deploy before disposable-Postgres role and concurrency acceptance.
-- Requires the separate reviewed team-total range patch (maximum 40).
CREATE OR REPLACE FUNCTION public.elleng_test_authorized_split_pair(
 p_tournament_id text, p_team_index integer, p_hole integer,
 p_pair_index integer, p_score integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
 v_uid uuid := auth.uid();
 v_draft_id text;
 v_state jsonb;
 v_owner uuid;
 v_team jsonb;
 v_roster jsonb;
 v_golfer_count integer;
 v_i integer;
 v_idx integer;
 v_indexes integer[] := ARRAY[]::integer[];
 v_a integer;
 v_b integer;
 v_total integer;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF p_tournament_id IS NULL OR btrim(p_tournament_id) = '' OR p_team_index IS NULL OR p_hole IS NULL OR p_pair_index IS NULL
    OR p_hole NOT BETWEEN 1 AND 18 OR p_pair_index NOT BETWEEN 0 AND 1
    OR (p_score IS NOT NULL AND p_score NOT BETWEEN 1 AND 20)
 THEN RAISE EXCEPTION 'Invalid Split-Pair score request'; END IF;

 -- Lock the existing parent row before reading draft and score state; this also
 -- serializes two callers for the same tournament across different devices.
 SELECT t.draft_id INTO v_draft_id
 FROM public.elleng_tournaments t
 WHERE t.id = p_tournament_id AND t.status IN ('setup','live')
 FOR UPDATE;
 IF v_draft_id IS NULL THEN RAISE EXCEPTION 'Tournament not available'; END IF;
 SELECT d.owner_id,d.state INTO v_owner,v_state
 FROM public.elleng_drafts d WHERE d.id=v_draft_id;
 IF v_state IS NULL THEN RAISE EXCEPTION 'Draft unavailable'; END IF;

 IF v_owner IS NULL THEN RAISE EXCEPTION 'Draft owner missing'; END IF;
 IF v_uid IS DISTINCT FROM v_owner AND NOT EXISTS (
   SELECT 1 FROM public.elleng_captains c
   WHERE c.draft_id=v_draft_id AND c.user_id=v_uid
     AND c.team_index=p_team_index
 ) THEN RAISE EXCEPTION 'Not authorized to score this team'; END IF;
 -- The owner or captain must be assigned to an active tournament team.
 IF p_team_index NOT BETWEEN 0 AND (
   SELECT t.team_count-1 FROM public.elleng_tournaments t WHERE t.id=p_tournament_id
 ) THEN RAISE EXCEPTION 'Team is outside active tournament'; END IF;
 IF v_state->>'playFormat' IS DISTINCT FROM 'split_pair'
 THEN RAISE EXCEPTION 'Split-Pair format not selected'; END IF;
 IF jsonb_typeof(v_state->'teams') IS DISTINCT FROM 'array'
    OR p_team_index NOT BETWEEN 0 AND jsonb_array_length(v_state->'teams')-1
 THEN RAISE EXCEPTION 'Team not found'; END IF;

 v_team:=v_state->'teams'->p_team_index;
 v_roster:=v_team->'roster';
 IF jsonb_typeof(v_roster) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_roster)<>4
    OR jsonb_typeof(v_state->'golfers') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Four drafted golfers required'; END IF;
 v_golfer_count:=jsonb_array_length(v_state->'golfers');
 FOR v_i IN 0..3 LOOP
   IF jsonb_typeof(v_roster->v_i) NOT IN ('number','string')
      OR (v_roster->>v_i) !~ '^(0|[1-9][0-9]*)$'
      OR length(v_roster->>v_i)>9
   THEN RAISE EXCEPTION 'Invalid golfer index'; END IF;
   v_idx:=(v_roster->>v_i)::integer;
   IF v_idx>=v_golfer_count OR v_idx=ANY(v_indexes)
     OR nullif(btrim(coalesce(v_state->'golfers'->v_idx->>'name','')),'') IS NULL
   THEN RAISE EXCEPTION 'Invalid or duplicate roster golfer'; END IF;
   v_indexes:=array_append(v_indexes,v_idx);
 END LOOP;

 IF p_score IS NULL THEN
   DELETE FROM public.elleng_pair_hole_scores
   WHERE tournament_id=p_tournament_id AND team_index=p_team_index
     AND hole=p_hole AND pair_index=p_pair_index;
 ELSE
   INSERT INTO public.elleng_pair_hole_scores
     (tournament_id,team_index,hole,pair_index,score,updated_by,updated_at)
   VALUES (p_tournament_id,p_team_index,p_hole,p_pair_index,p_score,v_uid,now())
   ON CONFLICT (tournament_id,hole,team_index,pair_index)
   DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=now();
 END IF;
 SELECT max(score) FILTER (WHERE pair_index=0),max(score) FILTER (WHERE pair_index=1)
 INTO v_a,v_b FROM public.elleng_pair_hole_scores
 WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole;
 IF v_a BETWEEN 1 AND 20 AND v_b BETWEEN 1 AND 20 THEN
   v_total:=v_a+v_b;
   INSERT INTO public.elleng_team_scores
     (tournament_id,team_index,hole,score,updated_by,updated_at)
   VALUES (p_tournament_id,p_team_index,p_hole,v_total,v_uid,now())
   ON CONFLICT (tournament_id,team_index,hole)
   DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=now();
 ELSE
   DELETE FROM public.elleng_team_scores
   WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole;
 END IF;
 RETURN jsonb_build_object('hole',p_hole,'team_index',p_team_index,
   'pair_0',v_a,'pair_1',v_b,'team_score',v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer) TO authenticated;
