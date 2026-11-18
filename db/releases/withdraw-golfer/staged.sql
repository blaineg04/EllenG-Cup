-- STAGED ONLY: do not apply to the live Nov 20 tournament until reviewed and tested.
-- Pre-scoring commissioner withdrawal; preserves picks, team rosters, golfer indexes and account rows.
-- This RPC requires a narrowly reviewed weighted-roster guard update before deployment.
CREATE OR REPLACE FUNCTION public.elleng_withdraw_golfer(
 p_draft_id text, p_tournament_id text, p_expected_updated_at timestamptz,
 p_golfer_index integer, p_reason text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 d public.elleng_drafts%ROWTYPE;
 t public.elleng_tournaments%ROWTYPE;
 s jsonb; golfer jsonb; roster_count integer; active_original integer; stamp timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_draft_id IS DISTINCT FROM 'elleng-cup' OR p_tournament_id IS DISTINCT FROM 'elleng-cup-live'
 THEN RAISE EXCEPTION 'Invalid tournament' USING ERRCODE='22023'; END IF;
 IF length(coalesce(p_reason,'')) > 250 THEN RAISE EXCEPTION 'Reason too long' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM public.elleng_tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND OR t.draft_id IS DISTINCT FROM p_draft_id OR t.status IS DISTINCT FROM 'setup'
 THEN RAISE EXCEPTION 'Withdrawal only available before tournament starts'; END IF;
 SELECT * INTO d FROM public.elleng_drafts WHERE id=p_draft_id FOR UPDATE;
 IF NOT FOUND OR d.owner_id IS DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'Commissioner access required' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NULL OR d.updated_at IS DISTINCT FROM p_expected_updated_at
 THEN RAISE EXCEPTION 'Tournament changed. Refresh and retry' USING ERRCODE='40001'; END IF;
 s:=d.state;
 IF s->>'playFormat' IS DISTINCT FROM 'shamble_points' OR
    jsonb_typeof(s->'picks') IS DISTINCT FROM 'array' OR
    jsonb_typeof(s->'golfers') IS DISTINCT FROM 'array' OR
    jsonb_typeof(s->'teams') IS DISTINCT FROM 'array' OR
    jsonb_array_length(s->'teams')<>2
 THEN RAISE EXCEPTION 'Unsupported draft structure'; END IF;
 IF p_golfer_index IS NULL OR p_golfer_index<0 OR p_golfer_index>=jsonb_array_length(s->'golfers')
 THEN RAISE EXCEPTION 'Invalid golfer index'; END IF;
 golfer:=s#>ARRAY['golfers',p_golfer_index::text];
 IF btrim(coalesce(golfer->>'name',''))='' OR
    coalesce((golfer->>'participating')::boolean,true)=false
 THEN RAISE EXCEPTION 'Golfer not active'; END IF;
 IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(s->'teams') team
    WHERE lower(btrim(coalesce(team->>'captain','')))=lower(btrim(golfer->>'name'))
 ) THEN RAISE EXCEPTION 'Captain withdrawal requires reassignment'; END IF;
 SELECT count(*) INTO roster_count FROM jsonb_array_elements(s->'teams') team,
   jsonb_array_elements_text(coalesce(team->'roster','[]'::jsonb)) ri
 WHERE ri=p_golfer_index::text;
 IF roster_count<>1 THEN RAISE EXCEPTION 'Golfer must be on exactly one team'; END IF;
 SELECT count(*) INTO active_original FROM jsonb_array_elements(s->'golfers') g
 WHERE btrim(coalesce(g->>'name',''))<>'' AND
   coalesce((g->>'participating')::boolean,true) AND
   coalesce((g->>'late_added')::boolean,false)=false;
 -- The historical 23 picks remain immutable; after a withdrawal the number of
 -- currently active original golfers can be smaller than the pick count.
 IF jsonb_array_length(s->'picks')<active_original
 THEN RAISE EXCEPTION 'Draft not complete'; END IF;
 IF EXISTS(SELECT 1 FROM public.elleng_team_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS(SELECT 1 FROM public.elleng_player_hole_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS(SELECT 1 FROM public.elleng_pair_hole_scores WHERE tournament_id=p_tournament_id)
 THEN RAISE EXCEPTION 'Scores exist; withdrawal blocked'; END IF;
 golfer:=golfer || jsonb_build_object(
   'participating',false,'withdrawn',true,'withdrawn_at',clock_timestamp(),
   'withdrawal_reason',btrim(coalesce(p_reason,'')));
 s:=jsonb_set(s,ARRAY['golfers',p_golfer_index::text],golfer,false);
 stamp:=clock_timestamp();
 UPDATE public.elleng_drafts SET state=s,updated_at=stamp WHERE id=p_draft_id;
 RETURN jsonb_build_object('ok',true,'golfer_index',p_golfer_index,'updated_at',stamp);
END;
$$;
REVOKE ALL ON FUNCTION public.elleng_withdraw_golfer(text,text,timestamptz,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elleng_withdraw_golfer(text,text,timestamptz,integer,text) TO authenticated;
