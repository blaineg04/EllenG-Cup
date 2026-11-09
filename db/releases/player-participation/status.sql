-- Additive release candidate; not applied automatically.
CREATE OR REPLACE FUNCTION public.elleng_set_player_participation(
 p_draft_id text,p_tournament_id text,p_golfer_index integer,p_participating boolean,p_expected_updated_at timestamptz,p_new_golfer jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.elleng_drafts%ROWTYPE; t public.elleng_tournaments%ROWTYPE;
 a public.elleng_player_accounts%ROWTYPE; s jsonb; g jsonb; gs jsonb; stamp timestamptz; ti integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_draft_id IS DISTINCT FROM 'elleng-cup' OR p_tournament_id IS DISTINCT FROM 'elleng-cup-live'
 OR p_golfer_index IS NULL OR p_golfer_index<0 OR p_golfer_index>1000 OR p_participating IS NULL THEN
 RAISE EXCEPTION 'Invalid tournament or golfer' USING ERRCODE='22023'; END IF;
 -- Match the scoring RPC lock order; no scores can start while status is changing.
 SELECT * INTO t FROM public.elleng_tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND OR t.draft_id IS DISTINCT FROM p_draft_id THEN RAISE EXCEPTION 'Tournament unavailable'; END IF;
 SELECT * INTO d FROM public.elleng_drafts WHERE id=p_draft_id FOR UPDATE;
 IF NOT FOUND OR d.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Commissioner access required' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NULL OR d.updated_at IS DISTINCT FROM p_expected_updated_at THEN
 RAISE EXCEPTION 'Tournament changed on another device. Refresh and try again.' USING ERRCODE='40001'; END IF;
 IF (p_new_golfer IS NULL OR p_participating) AND t.status IS DISTINCT FROM 'setup' THEN RAISE EXCEPTION 'Status can only change during tournament setup.'; END IF;
 s:=d.state;gs:=s->'golfers';g:=gs->p_golfer_index;
 IF jsonb_typeof(gs) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Golfer list unavailable'; END IF;
 IF (p_new_golfer IS NULL OR p_participating) AND (s->>'timerPaused'='false' OR (NOT p_participating AND jsonb_array_length(coalesce(s->'picks','[]'::jsonb))>0)
 OR EXISTS(SELECT 1 FROM public.elleng_team_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS(SELECT 1 FROM public.elleng_player_hole_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS(SELECT 1 FROM public.elleng_pair_hole_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS(SELECT 1 FROM public.elleng_group_assignments WHERE draft_id=p_draft_id AND golfer_index=p_golfer_index)
 OR (g->>'team' IS NOT NULL AND g->>'team'<>'')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s->'teams','[]'::jsonb)) tm,
 jsonb_array_elements_text(coalesce(tm->'roster','[]'::jsonb)) ri WHERE ri=p_golfer_index::text)) THEN
 RAISE EXCEPTION 'Draft picks, assignments or scores exist. Status was not changed.'; END IF;
 IF p_new_golfer IS NOT NULL THEN
  IF coalesce(btrim(g->>'name'),'')<>'' OR EXISTS(SELECT 1 FROM public.elleng_player_accounts WHERE draft_id=p_draft_id AND golfer_index=p_golfer_index) THEN RAISE EXCEPTION 'Golfer slot changed. Refresh and try again.' USING ERRCODE='40001'; END IF;
  IF jsonb_typeof(p_new_golfer) IS DISTINCT FROM 'object' OR length(btrim(coalesce(p_new_golfer->>'name','')))<2 OR length(p_new_golfer->>'name')>100 THEN RAISE EXCEPTION 'Enter a full golfer name'; END IF;
  g:=jsonb_build_object('name',btrim(p_new_golfer->>'name'),'hcp',coalesce(p_new_golfer->>'hcp',''),'band',coalesce(p_new_golfer->>'band',''),'self_ranked',coalesce((p_new_golfer->>'self_ranked')::boolean,false),'photo_url',coalesce(p_new_golfer->>'photo_url',''),'team',NULL);
  IF p_participating AND p_new_golfer->>'team' IS NOT NULL THEN
   ti:=(p_new_golfer->>'team')::integer;
   IF ti<0 OR ti>=jsonb_array_length(s->'teams') THEN RAISE EXCEPTION 'Invalid team'; END IF;
  END IF;
 ELSIF coalesce(btrim(g->>'name'),'')='' THEN
  SELECT * INTO a FROM public.elleng_player_accounts WHERE draft_id=p_draft_id AND golfer_index=p_golfer_index FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registered golfer unavailable'; END IF;
  g:=jsonb_build_object('name',coalesce(nullif(btrim(a.display_name),''),a.username),'photo_url',coalesce(a.photo_url,''),'team',NULL,'band','','hcp','','self_ranked',false);
  IF p_new_golfer IS NOT NULL THEN
  IF coalesce(btrim(g->>'name'),'')<>'' OR EXISTS(SELECT 1 FROM public.elleng_player_accounts WHERE draft_id=p_draft_id AND golfer_index=p_golfer_index) THEN RAISE EXCEPTION 'Golfer slot changed. Refresh and try again.' USING ERRCODE='40001'; END IF;
  IF jsonb_typeof(p_new_golfer) IS DISTINCT FROM 'object' OR length(btrim(coalesce(p_new_golfer->>'name','')))<2 OR length(p_new_golfer->>'name')>100 THEN RAISE EXCEPTION 'Enter a full golfer name'; END IF;
  g:=jsonb_build_object('name',btrim(p_new_golfer->>'name'),'hcp',coalesce(p_new_golfer->>'hcp',''),'band',coalesce(p_new_golfer->>'band',''),'self_ranked',coalesce((p_new_golfer->>'self_ranked')::boolean,false),'photo_url',coalesce(p_new_golfer->>'photo_url',''),'team',NULL);
  IF p_participating AND p_new_golfer->>'team' IS NOT NULL THEN
   ti:=(p_new_golfer->>'team')::integer;
   IF ti<0 OR ti>=jsonb_array_length(s->'teams') THEN RAISE EXCEPTION 'Invalid team'; END IF;
  END IF;
 ELSIF coalesce(btrim(g->>'name'),'')='' THEN RAISE EXCEPTION 'Save the golfer name first'; END IF;
 END IF;
 g:=g||jsonb_build_object('participating',p_participating,'team',ti);
 IF ti IS NOT NULL THEN s:=jsonb_set(s,ARRAY['teams',ti::text,'roster'],coalesce(s#>ARRAY['teams',ti::text,'roster'],'[]'::jsonb)||to_jsonb(p_golfer_index),true); END IF;
 WHILE jsonb_array_length(gs)<=p_golfer_index LOOP gs:=gs||jsonb_build_array(jsonb_build_object('name','','team',NULL,'participating',false)); END LOOP;
 gs:=jsonb_set(gs,ARRAY[p_golfer_index::text],g,false);
 s:=jsonb_set(s,'{golfers}',gs,false);stamp:=clock_timestamp();
 UPDATE public.elleng_drafts SET state=s,updated_at=stamp WHERE id=p_draft_id;
 RETURN jsonb_build_object('ok',true,'updated_at',stamp);
END;
$$;
REVOKE ALL ON FUNCTION public.elleng_set_player_participation(text,text,integer,boolean,timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elleng_set_player_participation(text,text,integer,boolean,timestamptz,jsonb) TO authenticated;
