-- REVIEW CANDIDATE ONLY. Do not apply to production.
-- Requires the separately reviewed weighted guard integration before execution.
-- This RPC is deliberately not granted to authenticated users in this file.
-- A later release must install a trigger guard that independently validates
-- the exact two-golfer team/roster delta before granting EXECUTE.
CREATE OR REPLACE FUNCTION public.elleng_swap_post_draft_golfers(
 p_draft_id text, p_tournament_id text, p_expected_updated_at timestamptz,
 p_first integer, p_second integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 d public.elleng_drafts%ROWTYPE;
 t public.elleng_tournaments%ROWTYPE;
 s jsonb; team_a integer; team_b integer; i integer; j integer;
 roster jsonb; updated_roster jsonb; entry jsonb; member_idx integer;
 first_hits integer:=0; second_hits integer:=0; originals integer;
 captain_name text; golfer_name text; captain_marker jsonb; revision timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_draft_id IS DISTINCT FROM 'elleng-cup' OR p_tournament_id IS DISTINCT FROM 'elleng-cup-live'
 THEN RAISE EXCEPTION 'Invalid tournament' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('elleng-shamble:'||p_tournament_id,0));
 SELECT * INTO t FROM public.elleng_tournaments WHERE id=p_tournament_id FOR UPDATE;
 IF NOT FOUND OR t.draft_id IS DISTINCT FROM p_draft_id OR t.status IS DISTINCT FROM 'setup'
 THEN RAISE EXCEPTION 'Tournament is not in setup'; END IF;
 SELECT * INTO d FROM public.elleng_drafts WHERE id=p_draft_id FOR UPDATE;
 IF NOT FOUND OR d.owner_id IS DISTINCT FROM auth.uid()
 THEN RAISE EXCEPTION 'Commissioner access required' USING ERRCODE='42501'; END IF;
 IF p_expected_updated_at IS NULL OR d.updated_at IS DISTINCT FROM p_expected_updated_at
 THEN RAISE EXCEPTION 'Draft changed; refresh and retry' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM public.elleng_player_hole_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS(SELECT 1 FROM public.elleng_team_scores WHERE tournament_id=p_tournament_id)
 OR EXISTS(SELECT 1 FROM public.elleng_pair_hole_scores WHERE tournament_id=p_tournament_id)
 THEN RAISE EXCEPTION 'Scores already exist; team changes are locked'; END IF;
 s:=d.state;
 IF s->>'draftRules' IS DISTINCT FROM 'weighted'
 OR jsonb_typeof(s->'golfers') IS DISTINCT FROM 'array'
 OR jsonb_typeof(s->'teams') IS DISTINCT FROM 'array'
 OR jsonb_array_length(s->'teams')<>2
 OR jsonb_typeof(s->'picks') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Invalid weighted draft'; END IF;
 SELECT count(*) INTO originals FROM jsonb_array_elements(s->'golfers') g
 WHERE btrim(coalesce(g->>'name',''))<>'' AND g->>'team' IN ('0','1')
 AND coalesce((g->>'late_added')::boolean,false)=false;
 IF originals<2 OR jsonb_array_length(s->'picks')<originals THEN RAISE EXCEPTION 'Draft not complete'; END IF;
 IF p_first IS NULL OR p_second IS NULL OR p_first=p_second OR p_first<0 OR p_second<0
 OR p_first>=jsonb_array_length(s->'golfers') OR p_second>=jsonb_array_length(s->'golfers')
 THEN RAISE EXCEPTION 'Invalid golfers'; END IF;
 FOR i IN SELECT unnest(ARRAY[p_first,p_second]) LOOP
  IF btrim(coalesce(s#>>ARRAY['golfers',i::text,'name'],''))=''
  OR coalesce((s#>>ARRAY['golfers',i::text,'participating'])::boolean,true)=false
  OR coalesce((s#>>ARRAY['golfers',i::text,'withdrawn'])::boolean,false)=true
  THEN RAISE EXCEPTION 'Inactive or unnamed golfer cannot swap'; END IF;
  golfer_name:=lower(btrim(s#>>ARRAY['golfers',i::text,'name']));
  FOR j IN 0..1 LOOP
   captain_marker:=s#>ARRAY['teams',j::text,'captain'];
   captain_name:=lower(btrim(coalesce(s#>>ARRAY['teams',j::text,'captain'],'')));
   IF captain_name=golfer_name
      OR (jsonb_typeof(captain_marker)='number' AND captain_marker::text=i::text)
      OR (jsonb_typeof(captain_marker)='object' AND captain_marker->>'golferIndex'=i::text)
   THEN RAISE EXCEPTION 'Captains cannot swap'; END IF;
  END LOOP;
 END LOOP;
 team_a:=(s#>>ARRAY['golfers',p_first::text,'team'])::integer;
 team_b:=(s#>>ARRAY['golfers',p_second::text,'team'])::integer;
 IF team_a NOT IN (0,1) OR team_b NOT IN (0,1) OR team_a=team_b
 THEN RAISE EXCEPTION 'Golfers must be on opposite teams'; END IF;
 FOR j IN 0..1 LOOP
  roster:=s#>ARRAY['teams',j::text,'roster'];
  IF jsonb_typeof(roster) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid roster'; END IF;
  updated_roster:='[]'::jsonb;
  FOR entry IN SELECT value FROM jsonb_array_elements(roster) LOOP
   IF jsonb_typeof(entry)='number' THEN member_idx:=(entry::text)::integer;
   ELSIF jsonb_typeof(entry)='object' AND entry ? 'golferIndex'
   THEN member_idx:=(entry->>'golferIndex')::integer;
   ELSE RAISE EXCEPTION 'Invalid roster entry'; END IF;
   IF member_idx<0 OR member_idx>=jsonb_array_length(s->'golfers')
   OR s#>>ARRAY['golfers',member_idx::text,'team'] IS DISTINCT FROM j::text
   THEN RAISE EXCEPTION 'Stored roster and golfer team disagree'; END IF;
   IF member_idx=p_first THEN
    first_hits:=first_hits+1;
    IF j<>team_a THEN RAISE EXCEPTION 'First golfer roster mismatch'; END IF;
    IF jsonb_typeof(entry)='number' THEN entry:=to_jsonb(p_second);
    ELSE entry:=jsonb_set(entry,'{golferIndex}',to_jsonb(p_second)); END IF;
   ELSIF member_idx=p_second THEN
    second_hits:=second_hits+1;
    IF j<>team_b THEN RAISE EXCEPTION 'Second golfer roster mismatch'; END IF;
    IF jsonb_typeof(entry)='number' THEN entry:=to_jsonb(p_first);
    ELSE entry:=jsonb_set(entry,'{golferIndex}',to_jsonb(p_first)); END IF;
   END IF;
   updated_roster:=updated_roster||jsonb_build_array(entry);
  END LOOP;
  s:=jsonb_set(s,ARRAY['teams',j::text,'roster'],updated_roster);
 END LOOP;
 IF first_hits<>1 OR second_hits<>1 THEN RAISE EXCEPTION 'Golfer roster membership invalid'; END IF;
 s:=jsonb_set(s,ARRAY['golfers',p_first::text,'team'],to_jsonb(team_b));
 s:=jsonb_set(s,ARRAY['golfers',p_second::text,'team'],to_jsonb(team_a));
 revision:=clock_timestamp();
 UPDATE public.elleng_drafts SET state=s,updated_at=revision WHERE id=p_draft_id;
 RETURN jsonb_build_object('ok',true,'updated_at',revision);
END $fn$;
-- Intentionally no GRANT EXECUTE. The existing weighted guard rejects this
-- update until a separately reviewed exact-delta exception is installed.
REVOKE ALL ON FUNCTION public.elleng_swap_post_draft_golfers(text,text,timestamptz,integer,integer) FROM PUBLIC,anon,authenticated;
