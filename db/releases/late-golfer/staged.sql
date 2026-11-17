-- STAGED ONLY. Do not apply to production before confirming draft-complete marker and running authenticated tests.
CREATE OR REPLACE FUNCTION public.elleng_add_late_golfer(
 p_draft_id text, p_tournament_id text, p_expected_updated_at timestamptz,
 p_name text, p_team_index integer, p_band text, p_hcp text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 d public.elleng_drafts%ROWTYPE;
 t public.elleng_tournaments%ROWTYPE;
 s jsonb; gs jsonb; ts jsonb; roster jsonb; golfer jsonb;
 idx integer; stamp timestamptz; clean_name text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_draft_id IS DISTINCT FROM 'elleng-cup' OR p_tournament_id IS DISTINCT FROM 'elleng-cup-live'
    OR p_team_index IS NULL OR p_team_index NOT BETWEEN 0 AND 1
 THEN RAISE EXCEPTION 'Invalid tournament or team' USING ERRCODE='22023'; END IF;
 clean_name:=btrim(coalesce(p_name,''));
 IF length(clean_name) NOT BETWEEN 2 AND 100 OR p_band IS NULL OR p_band NOT IN ('A','B','C','D')
    OR length(coalesce(p_hcp,''))>20
 THEN RAISE EXCEPTION 'Invalid golfer details' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM public.elleng_tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND OR t.draft_id IS DISTINCT FROM p_draft_id OR t.status NOT IN ('setup','live')
 THEN RAISE EXCEPTION 'Tournament unavailable for late enrollment'; END IF;
 SELECT * INTO d FROM public.elleng_drafts WHERE id=p_draft_id FOR UPDATE;
 IF NOT FOUND OR d.owner_id IS DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'Commissioner access required' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NULL OR d.updated_at IS DISTINCT FROM p_expected_updated_at
 THEN RAISE EXCEPTION 'Tournament changed. Refresh and retry' USING ERRCODE='40001'; END IF;
 s:=d.state; gs:=s->'golfers'; ts:=s->'teams';
 IF jsonb_typeof(gs) IS DISTINCT FROM 'array' OR jsonb_typeof(ts) IS DISTINCT FROM 'array'
    OR jsonb_array_length(ts)<>2 OR jsonb_typeof(s->'picks') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Draft structure unavailable'; END IF;
 -- Fail closed until the deployed draft's authoritative completion marker is verified.
 IF jsonb_array_length(s->'picks')=0 OR\n    jsonb_array_length(s->'picks') IS DISTINCT FROM\n      (SELECT count(*)::integer FROM jsonb_array_elements(gs) g WHERE coalesce(btrim(g->>'name'),'')<>'' AND coalesce((g->>'participating')::boolean,true) AND coalesce((g->>'late_added')::boolean,false)=false)
 THEN RAISE EXCEPTION 'Verified completed draft required'; END IF;
 IF coalesce(s->>'playFormat','') NOT IN ('shamble_points','shamble')
 THEN RAISE EXCEPTION 'Unsupported tournament format'; END IF;
 IF EXISTS(SELECT 1 FROM public.elleng_team_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS(SELECT 1 FROM public.elleng_player_hole_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS(SELECT 1 FROM public.elleng_pair_hole_scores WHERE tournament_id=p_tournament_id)
 THEN RAISE EXCEPTION 'Scores already exist; late enrollment blocked'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(gs) g
   WHERE lower(btrim(coalesce(g->>'name','')))=lower(clean_name))
 THEN RAISE EXCEPTION 'Golfer already exists'; END IF;
 idx:=jsonb_array_length(gs);
 IF idx>=40 THEN RAISE EXCEPTION 'Golfer capacity reached'; END IF;
 IF EXISTS(SELECT 1 FROM public.elleng_player_accounts
           WHERE draft_id=p_draft_id AND golfer_index=idx)
 THEN RAISE EXCEPTION 'Next golfer index reserved for an account'; END IF;
 roster:=ts#>ARRAY[p_team_index::text,'roster'];
 IF jsonb_typeof(roster) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Team roster unavailable'; END IF;
 golfer:=jsonb_build_object('name',clean_name,'hcp',coalesce(p_hcp,''),
  'band',p_band,'self_ranked',false,'photo_url','','participating',true,'late_added',true,'team',p_team_index);
 s:=jsonb_set(s,'{golfers}',gs||jsonb_build_array(golfer),false);
 s:=jsonb_set(s,ARRAY['teams',p_team_index::text,'roster'],roster||to_jsonb(idx),false);
 stamp:=clock_timestamp();
 UPDATE public.elleng_drafts SET state=s,updated_at=stamp WHERE id=p_draft_id;
 RETURN jsonb_build_object('ok',true,'golfer_index',idx,'updated_at',stamp);
END;
$$;
REVOKE ALL ON FUNCTION public.elleng_add_late_golfer(text,text,timestamptz,text,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elleng_add_late_golfer(text,text,timestamptz,text,integer,text,text) TO authenticated;
