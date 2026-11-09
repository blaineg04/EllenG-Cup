-- Commissioner handicap override. Existing golfers retain their ability to update their own handicap.
CREATE OR REPLACE FUNCTION public.elleng_set_commissioner_handicap(
 p_draft_id text, p_tournament_id text, p_golfer_index integer,
 p_handicap text, p_band text, p_expected_updated_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE d public.elleng_drafts%ROWTYPE; t public.elleng_tournaments%ROWTYPE;
 s jsonb; g jsonb; h text; b text; n numeric; stamp timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_draft_id IS DISTINCT FROM 'elleng-cup' OR p_tournament_id IS DISTINCT FROM 'elleng-cup-live'
 OR p_golfer_index IS NULL OR p_golfer_index < 0 OR p_golfer_index > 1000 THEN
 RAISE EXCEPTION 'Invalid golfer or tournament' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM public.elleng_tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND OR t.draft_id IS DISTINCT FROM p_draft_id OR t.status IS DISTINCT FROM 'setup'
 THEN RAISE EXCEPTION 'Handicap changes are only allowed during tournament setup'; END IF;
 SELECT * INTO d FROM public.elleng_drafts WHERE id=p_draft_id FOR UPDATE;
 IF NOT FOUND OR d.owner_id IS DISTINCT FROM auth.uid() THEN
 RAISE EXCEPTION 'Commissioner access required' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NULL OR d.updated_at IS DISTINCT FROM p_expected_updated_at
 THEN RAISE EXCEPTION 'Tournament changed on another device. Refresh and try again.' USING ERRCODE='40001'; END IF;
 s:=d.state;
 IF s->>'timerPaused'='false' THEN RAISE EXCEPTION 'Pause the draft before changing handicaps'; END IF;
 IF jsonb_typeof(s->'golfers') IS DISTINCT FROM 'array' OR p_golfer_index >= jsonb_array_length(s->'golfers')
 THEN RAISE EXCEPTION 'Golfer not found'; END IF;
 g:=s->'golfers'->p_golfer_index;
 IF coalesce(btrim(g->>'name'),'')='' THEN RAISE EXCEPTION 'Golfer not found'; END IF;
 -- Inactive registered golfers may also receive a handicap without joining the draft.
 IF EXISTS (SELECT 1 FROM public.elleng_team_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS (SELECT 1 FROM public.elleng_player_hole_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS (SELECT 1 FROM public.elleng_pair_hole_scores WHERE tournament_id=p_tournament_id)
 THEN RAISE EXCEPTION 'Scores already exist. Handicap not changed'; END IF;
 h:=btrim(coalesce(p_handicap,'')); b:=upper(btrim(coalesce(p_band,'')));
 IF h<>'' THEN
   IF length(h)>8 OR h !~ '^[0-9]+([.][0-9]+)?$' THEN RAISE EXCEPTION 'Invalid handicap'; END IF;
   n:=h::numeric;
   IF n<0 OR n>54 THEN RAISE EXCEPTION 'Handicap must be between 0 and 54'; END IF;
   b:=CASE WHEN n<=9 THEN 'A' WHEN n<=17 THEN 'B' WHEN n<=25 THEN 'C' ELSE 'D' END;
 ELSIF b NOT IN ('A','B','C','D') THEN RAISE EXCEPTION 'Choose a handicap range'; END IF;
 g:=g||jsonb_build_object('hcp',h,'band',b,'self_ranked',true);
 s:=jsonb_set(s,ARRAY['golfers',p_golfer_index::text],g,false);
 stamp:=clock_timestamp();
 UPDATE public.elleng_drafts SET state=s,updated_at=stamp WHERE id=p_draft_id;
 RETURN jsonb_build_object('ok',true,'band',b,'handicap',h,'updated_at',stamp);
END;
$$;
REVOKE ALL ON FUNCTION public.elleng_set_commissioner_handicap(text,text,integer,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elleng_set_commissioner_handicap(text,text,integer,text,text,timestamptz) TO authenticated;
