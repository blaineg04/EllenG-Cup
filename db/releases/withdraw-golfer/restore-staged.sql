-- STAGED ONLY: commissioner restore of a previously withdrawn golfer before any score.
CREATE OR REPLACE FUNCTION public.elleng_restore_golfer(
 p_draft_id text, p_tournament_id text, p_expected_updated_at timestamptz,
 p_golfer_index integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 d public.elleng_drafts%ROWTYPE;
 t public.elleng_tournaments%ROWTYPE;
 s jsonb; g jsonb; stamp timestamptz; roster_count integer; original_count integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_draft_id IS DISTINCT FROM 'elleng-cup' OR p_tournament_id IS DISTINCT FROM 'elleng-cup-live'
 THEN RAISE EXCEPTION 'Invalid tournament' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM public.elleng_tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND OR t.draft_id IS DISTINCT FROM p_draft_id OR t.status IS DISTINCT FROM 'setup'
 THEN RAISE EXCEPTION 'Restore only available before tournament starts'; END IF;
 SELECT * INTO d FROM public.elleng_drafts WHERE id=p_draft_id FOR UPDATE;
 IF NOT FOUND OR d.owner_id IS DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'Commissioner access required' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NULL OR d.updated_at IS DISTINCT FROM p_expected_updated_at
 THEN RAISE EXCEPTION 'Tournament changed. Refresh and retry' USING ERRCODE='40001'; END IF;
 s:=d.state;
 IF s->>'playFormat' IS DISTINCT FROM 'shamble_points'
 OR jsonb_typeof(s->'golfers') IS DISTINCT FROM 'array'
 OR jsonb_typeof(s->'teams') IS DISTINCT FROM 'array'
 OR jsonb_array_length(s->'teams')<>2
 OR jsonb_typeof(s->'picks') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Unsupported draft structure'; END IF;
 SELECT count(*) INTO original_count FROM jsonb_array_elements(s->'golfers') original_g
 WHERE btrim(coalesce(original_g->>'name',''))<>''
 AND coalesce((original_g->>'late_added')::boolean,false)=false;
 IF jsonb_array_length(s->'picks')<original_count
 THEN RAISE EXCEPTION 'Draft not complete'; END IF;
 IF p_golfer_index IS NULL OR p_golfer_index<0 OR p_golfer_index>=jsonb_array_length(s->'golfers')
 THEN RAISE EXCEPTION 'Invalid golfer'; END IF;
 g:=s#>ARRAY['golfers',p_golfer_index::text];
 IF btrim(coalesce(g->>'name',''))='' OR g->>'participating' IS DISTINCT FROM 'false'
 OR g->>'withdrawn' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'Golfer is not withdrawn'; END IF;
 SELECT count(*) INTO roster_count FROM jsonb_array_elements(s->'teams') team,
 jsonb_array_elements_text(coalesce(team->'roster','[]'::jsonb)) ri
 WHERE ri=p_golfer_index::text;
 IF roster_count<>1 THEN RAISE EXCEPTION 'Original team assignment missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.elleng_team_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS(SELECT 1 FROM public.elleng_player_hole_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS(SELECT 1 FROM public.elleng_pair_hole_scores WHERE tournament_id=p_tournament_id)
 THEN RAISE EXCEPTION 'Scores exist; restore blocked'; END IF;
 g:=g || jsonb_build_object('participating',true,'withdrawn',false);
 g:=g-'withdrawn_at'-'withdrawal_reason';
 s:=jsonb_set(s,ARRAY['golfers',p_golfer_index::text],g,false);
 stamp:=clock_timestamp();
 PERFORM set_config('elleng.withdrawal_rpc_authorized','yes',true);
 UPDATE public.elleng_drafts SET state=s,updated_at=stamp WHERE id=p_draft_id;
 PERFORM set_config('elleng.withdrawal_rpc_authorized','',true);
 RETURN jsonb_build_object('ok',true,'golfer_index',p_golfer_index,'updated_at',stamp);
END;
$$;
REVOKE ALL ON FUNCTION public.elleng_restore_golfer(text,text,timestamptz,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elleng_restore_golfer(text,text,timestamptz,integer) TO authenticated;
