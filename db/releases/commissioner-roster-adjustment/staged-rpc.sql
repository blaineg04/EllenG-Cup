-- STAGED ONLY. Do not apply until the weighted-roster guard explicitly authorizes
-- this RPC's exact changes and isolated authenticated tests pass.
-- This function is commissioner-only and limited to the Nov 20 tournament.
CREATE OR REPLACE FUNCTION public.elleng_commissioner_move_golfer(
 p_expected_updated_at timestamptz,
 p_golfer_index integer,
 p_expected_name text,
 p_destination_team integer,
 p_activate boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 d public.elleng_drafts%ROWTYPE;
 t public.elleng_tournaments%ROWTYPE;
 s jsonb; g jsonb; source_team integer; i integer;
 old_roster jsonb; new_roster jsonb; new_picks jsonb;
 roster_hits integer; pick_hits integer; stamp timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.elleng_tournaments WHERE id='elleng-cup-live' FOR UPDATE;
 IF NOT FOUND OR t.draft_id IS DISTINCT FROM 'elleng-cup' OR t.status IS DISTINCT FROM 'setup'
 THEN RAISE EXCEPTION 'Tournament is not in setup'; END IF;
 SELECT * INTO d FROM public.elleng_drafts WHERE id='elleng-cup' FOR UPDATE;
 IF NOT FOUND OR d.owner_id IS DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'Commissioner access required' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NULL OR d.updated_at IS DISTINCT FROM p_expected_updated_at
 THEN RAISE EXCEPTION 'Roster changed; refresh and retry' USING ERRCODE='40001'; END IF;
 IF EXISTS (SELECT 1 FROM public.elleng_player_hole_scores WHERE tournament_id=t.id)
 OR EXISTS (SELECT 1 FROM public.elleng_team_scores WHERE tournament_id=t.id)
 OR EXISTS (SELECT 1 FROM public.elleng_pair_hole_scores WHERE tournament_id=t.id)
 OR EXISTS (SELECT 1 FROM public.elleng_group_assignments WHERE draft_id=d.id)
 THEN RAISE EXCEPTION 'Scoring or group assignments exist; roster changes blocked'; END IF;
 s:=d.state;
 IF s->>'draftRules' IS DISTINCT FROM 'weighted'
 OR s->>'playFormat' IS DISTINCT FROM 'shamble_points'
 OR jsonb_typeof(s->'golfers') IS DISTINCT FROM 'array'
 OR jsonb_typeof(s->'teams') IS DISTINCT FROM 'array'
 OR jsonb_typeof(s->'picks') IS DISTINCT FROM 'array'
 OR jsonb_array_length(s->'teams')<>2
 OR p_destination_team NOT IN (0,1)
 OR p_golfer_index IS NULL OR p_golfer_index<0
 OR p_golfer_index>=jsonb_array_length(s->'golfers')
 THEN RAISE EXCEPTION 'Invalid draft or golfer selection'; END IF;
 g:=s#>ARRAY['golfers',p_golfer_index::text];
 IF btrim(coalesce(g->>'name','')) IS DISTINCT FROM btrim(coalesce(p_expected_name,''))
 OR btrim(coalesce(p_expected_name,''))=''
 THEN RAISE EXCEPTION 'Golfer identity mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'teams') team
           WHERE lower(btrim(team->>'captain'))=lower(btrim(p_expected_name)))
 THEN RAISE EXCEPTION 'Captain reassignment not permitted'; END IF;
 SELECT count(*) INTO roster_hits FROM jsonb_array_elements(s->'teams') team,
 jsonb_array_elements_text(team->'roster') ri WHERE ri=p_golfer_index::text;
 SELECT count(*) INTO pick_hits FROM jsonb_array_elements(s->'picks') p
 WHERE p->>'golfer'=p_golfer_index::text;
 IF roster_hits>1 OR pick_hits>1 THEN RAISE EXCEPTION 'Duplicate golfer assignment'; END IF;
 IF g->>'team' IN ('0','1') THEN
   source_team:=(g->>'team')::integer;
   IF roster_hits<>1 OR pick_hits<>1 THEN RAISE EXCEPTION 'Existing draft assignment inconsistent'; END IF;
   IF coalesce((g->>'withdrawn')::boolean,false) THEN RAISE EXCEPTION 'Withdrawn golfer requires restore first'; END IF;
 ELSE
   source_team:=NULL;
   IF roster_hits<>0 OR pick_hits<>0 OR NOT p_activate
   THEN RAISE EXCEPTION 'Unassigned golfer requires explicit activation'; END IF;
 END IF;
 IF source_team=p_destination_team AND NOT p_activate THEN RAISE EXCEPTION 'Already on destination team'; END IF;
 IF source_team IS NULL AND coalesce((g->>'participating')::boolean,true) AND NOT p_activate
 THEN RAISE EXCEPTION 'Explicit activation required'; END IF;
 FOR i IN 0..1 LOOP
   SELECT coalesce(jsonb_agg(v ORDER BY ord),'[]'::jsonb) INTO old_roster
   FROM jsonb_array_elements(s#>ARRAY['teams',i::text,'roster']) WITH ORDINALITY x(v,ord)
   WHERE v::text<>p_golfer_index::text;
   IF i=p_destination_team THEN
     new_roster:=old_roster||jsonb_build_array(p_golfer_index);
   ELSE new_roster:=old_roster; END IF;
   s:=jsonb_set(s,ARRAY['teams',i::text,'roster'],new_roster,false);
 END LOOP;
 g:=jsonb_set(g,'{team}',to_jsonb(p_destination_team),true);
 IF p_activate THEN
   g:=jsonb_set(g,'{participating}','true'::jsonb,true);
   g:=g-'withdrawn'-'withdrawn_at'-'withdrawal_reason';
 END IF;
 s:=jsonb_set(s,ARRAY['golfers',p_golfer_index::text],g,false);
 IF source_team IS NULL THEN
   s:=jsonb_set(s,'{picks}',(s->'picks')||jsonb_build_array(
      jsonb_build_object('golfer',p_golfer_index,'team',p_destination_team,'late',true)),false);
 ELSE
   SELECT jsonb_agg(CASE WHEN p->>'golfer'=p_golfer_index::text
          THEN jsonb_set(p,'{team}',to_jsonb(p_destination_team),false)
          ELSE p END ORDER BY ord) INTO new_picks
   FROM jsonb_array_elements(s->'picks') WITH ORDINALITY x(p,ord);
   s:=jsonb_set(s,'{picks}',new_picks,false);
 END IF;
 stamp:=clock_timestamp();
 UPDATE public.elleng_drafts SET state=s,updated_at=stamp WHERE id=d.id;
 RETURN jsonb_build_object('ok',true,'golfer_index',p_golfer_index,
    'destination_team',p_destination_team,'updated_at',stamp);
END;
$$;
REVOKE ALL ON FUNCTION public.elleng_commissioner_move_golfer(timestamptz,integer,text,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elleng_commissioner_move_golfer(timestamptz,integer,text,integer,boolean) TO authenticated;
