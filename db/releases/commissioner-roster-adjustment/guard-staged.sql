-- STAGED ONLY. Replaces the existing trigger function, not the trigger.
-- Preserve the original weighted draft guard, with one tightly constrained pre-scoring
-- withdrawal/restore exception. This exception is only valid for a single golfer and a
-- byte-for-byte identical state outside that golfer's withdrawal flags.
CREATE OR REPLACE FUNCTION public.elleng_guard_weighted_roster()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE
 old_field jsonb; new_field jsonb; playing_count integer;
 idx integer; before_g jsonb; after_g jsonb; before_base jsonb; after_base jsonb;
 differences integer:=0; original_count integer;
BEGIN
 IF old.state->>'draftRules' IS DISTINCT FROM 'weighted' THEN RETURN new; END IF;
 IF new.state->>'draftRules' IS DISTINCT FROM 'weighted' THEN
   RAISE EXCEPTION 'Weighted draft rules cannot be disabled through roster updates';
 END IF;
 SELECT count(*) INTO playing_count FROM jsonb_array_elements(old.state->'golfers')
 WHERE btrim(coalesce(value->>'name',''))<>'' AND coalesce((value->>'participating')::boolean,true);
 -- Preserve the original completed-draft behavior for every other draft.
 -- Only the target tournament receives the narrower post-draft protection.
 IF old.id IS DISTINCT FROM 'elleng-cup'
    AND jsonb_array_length(old.state->'picks')>=playing_count
 THEN RETURN new; END IF;
 -- Do not return early after draft completion: the narrow exception below
 -- must be evaluated for every golfer mutation, including restored rosters.
 -- Non-golfer state changes still pass through the original guard checks.
 -- Once a weighted draft is complete, any change to golfer data must be
 -- a validated single-golfer withdrawal/restore below, not a general roster edit.
 -- During an unfinished draft preserve the original weighted guard behavior.
 -- Existing paused reset exception (unchanged).
 IF jsonb_array_length(coalesce(old.state->'picks','[]'::jsonb))=2
 AND old.state->>'timerPaused'='true'
 AND new.state->>'timerPaused'='true'
 AND new.state->'picks'=old.state->'picks'
 AND (old.state->'picks'->0->>'captain')::boolean IS TRUE
 AND (old.state->'picks'->1->>'captain')::boolean IS TRUE
 AND NOT EXISTS(SELECT 1 FROM public.elleng_team_scores WHERE tournament_id='elleng-cup-live')
 AND NOT EXISTS(SELECT 1 FROM public.elleng_player_hole_scores WHERE tournament_id='elleng-cup-live')
 AND NOT EXISTS(SELECT 1 FROM public.elleng_pair_hole_scores WHERE tournament_id='elleng-cup-live')
 AND NOT EXISTS(SELECT 1 FROM public.elleng_group_assignments WHERE draft_id='elleng-cup')
 AND EXISTS(SELECT 1 FROM public.elleng_tournaments WHERE id='elleng-cup-live' AND status='setup')
 THEN RETURN new; END IF;
 -- Narrow single-golfer withdrawal or restore exception for a completed variable-size draft.
 SELECT count(*) INTO original_count FROM jsonb_array_elements(old.state->'golfers') original_g
 WHERE btrim(coalesce(original_g->>'name',''))<>''
 AND original_g->>'team' IN ('0','1')
 AND coalesce((original_g->>'late_added')::boolean,false)=false;
 IF old.id='elleng-cup'
 AND auth.uid() IS NOT NULL AND old.owner_id=auth.uid()
 AND current_user = (
   SELECT pg_get_userbyid(proowner) FROM pg_proc
   WHERE oid='public.elleng_withdraw_golfer(text,text,timestamptz,integer,text)'::regprocedure
 )
 AND jsonb_array_length(old.state->'picks')>=original_count
 AND old.state->'picks'=new.state->'picks'
 AND old.state->'teams'=new.state->'teams'
 AND old.state - 'golfers'=new.state - 'golfers'
 AND jsonb_array_length(old.state->'golfers')=jsonb_array_length(new.state->'golfers')
 AND EXISTS(SELECT 1 FROM public.elleng_tournaments WHERE id='elleng-cup-live' AND status='setup')
 AND NOT EXISTS(SELECT 1 FROM public.elleng_team_scores WHERE tournament_id='elleng-cup-live')
 AND NOT EXISTS(SELECT 1 FROM public.elleng_player_hole_scores WHERE tournament_id='elleng-cup-live')
 AND NOT EXISTS(SELECT 1 FROM public.elleng_pair_hole_scores WHERE tournament_id='elleng-cup-live')
 THEN
   FOR idx IN 0..jsonb_array_length(old.state->'golfers')-1 LOOP
     before_g:=old.state#>ARRAY['golfers',idx::text];
     after_g:=new.state#>ARRAY['golfers',idx::text];
     IF before_g IS DISTINCT FROM after_g THEN
       differences:=differences+1;
       before_base:=before_g-'participating'-'withdrawn'-'withdrawn_at'-'withdrawal_reason';
       after_base:=after_g-'participating'-'withdrawn'-'withdrawn_at'-'withdrawal_reason';
       -- Direct table updates must not bypass RPC captain and roster protections.
       IF EXISTS (
         SELECT 1 FROM jsonb_array_elements(old.state->'teams') t
         WHERE lower(btrim(coalesce(t->>'captain','')))=lower(btrim(coalesce(before_g->>'name','')))
       ) THEN RAISE EXCEPTION 'Captain withdrawal or restore requires separate policy'; END IF;
       IF (
         SELECT count(*) FROM jsonb_array_elements(old.state->'teams') t,
         jsonb_array_elements_text(coalesce(t->'roster','[]'::jsonb)) ri
         WHERE ri=idx::text
       )<>1 THEN RAISE EXCEPTION 'Golfer must have one original team'; END IF;
       IF differences>1 OR before_base IS DISTINCT FROM after_base
       OR NOT (
         (coalesce((before_g->>'participating')::boolean,true) IS TRUE
          AND after_g->>'participating'='false'
          AND after_g->>'withdrawn'='true'
          AND after_g->>'withdrawn_at' IS NOT NULL)
         OR
         (before_g->>'participating'='false'
          AND before_g->>'withdrawn'='true'
          AND after_g->>'participating'='true'
          AND after_g->>'withdrawn'='false'
          AND after_g->>'withdrawn_at' IS NULL
          AND after_g->>'withdrawal_reason' IS NULL)
       )
       THEN RAISE EXCEPTION 'Unauthorized roster change'; END IF;
     END IF;
   END LOOP;
   IF differences=1 THEN RETURN new; END IF;
 END IF;

 -- Narrow commissioner move exception: the RPC and this trigger must agree on the
 -- exact single-golfer delta. A caller cannot use this to modify arbitrary state.
 IF old.id='elleng-cup'
 AND auth.uid() IS NOT NULL AND old.owner_id=auth.uid()
 AND current_user=(SELECT pg_get_userbyid(proowner) FROM pg_proc
   WHERE oid='public.elleng_commissioner_move_golfer(timestamptz,integer,text,integer,boolean)'::regprocedure)
 AND old.state-'golfers'-'teams'-'picks'=new.state-'golfers'-'teams'-'picks'
 AND jsonb_array_length(old.state->'golfers')=jsonb_array_length(new.state->'golfers')
 AND jsonb_array_length(old.state->'teams')=2
 AND EXISTS(SELECT 1 FROM public.elleng_tournaments
            WHERE id='elleng-cup-live' AND status='setup')
 AND NOT EXISTS(SELECT 1 FROM public.elleng_team_scores WHERE tournament_id='elleng-cup-live')
 AND NOT EXISTS(SELECT 1 FROM public.elleng_player_hole_scores WHERE tournament_id='elleng-cup-live')
 AND NOT EXISTS(SELECT 1 FROM public.elleng_pair_hole_scores WHERE tournament_id='elleng-cup-live')
 AND NOT EXISTS(SELECT 1 FROM public.elleng_group_assignments WHERE draft_id='elleng-cup')
 THEN
  DECLARE
   changed_idx integer:=-1; changes integer:=0;
   old_g jsonb; new_g jsonb; old_team integer; target_team integer;
   expected_roster jsonb; expected_picks jsonb; roster jsonb;
   n integer; r integer; pick_count integer;
  BEGIN
   FOR n IN 0..jsonb_array_length(old.state->'golfers')-1 LOOP
    IF old.state#>ARRAY['golfers',n::text] IS DISTINCT FROM new.state#>ARRAY['golfers',n::text] THEN
      changes:=changes+1; changed_idx:=n;
    END IF;
   END LOOP;
   IF changes=1 THEN
    old_g:=old.state#>ARRAY['golfers',changed_idx::text];
    new_g:=new.state#>ARRAY['golfers',changed_idx::text];
    IF old_g->>'team' IN ('0','1') THEN old_team:=(old_g->>'team')::integer;
    ELSE old_team:=NULL; END IF;
    IF new_g->>'team' IN ('0','1') THEN target_team:=(new_g->>'team')::integer;
    ELSE target_team:=NULL; END IF;
    IF target_team IS NOT NULL AND target_team IS DISTINCT FROM old_team
     AND old_g-'team'-'participating'-'withdrawn'-'withdrawn_at'-'withdrawal_reason'
         =new_g-'team'-'participating'-'withdrawn'-'withdrawn_at'-'withdrawal_reason'
     AND coalesce((old_g->>'withdrawn')::boolean,false)=false
     AND coalesce((new_g->>'participating')::boolean,true)=true
     AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(old.state->'teams') team
        WHERE lower(btrim(team->>'captain'))=lower(btrim(old_g->>'name')))
    THEN
     -- The RPC can only remove this index from both old rosters, then append
     -- it to the destination; all other roster entries must retain order.
     FOR r IN 0..1 LOOP
      SELECT coalesce(jsonb_agg(v ORDER BY ord),'[]'::jsonb) INTO expected_roster
      FROM jsonb_array_elements(old.state#>ARRAY['teams',r::text,'roster'])
        WITH ORDINALITY x(v,ord)
      WHERE v::text<>changed_idx::text;
      IF r=target_team THEN expected_roster:=expected_roster||jsonb_build_array(changed_idx); END IF;
      IF new.state#>ARRAY['teams',r::text,'roster'] IS DISTINCT FROM expected_roster
       OR (old.state#>ARRAY['teams',r::text])-'roster'
         IS DISTINCT FROM (new.state#>ARRAY['teams',r::text])-'roster'
      THEN RAISE EXCEPTION 'Unauthorized team roster modification'; END IF;
     END LOOP;
     SELECT count(*) INTO pick_count FROM jsonb_array_elements(old.state->'picks') p
      WHERE p->>'golfer'=changed_idx::text;
     IF (old_team IS NULL AND pick_count=0) OR (old_team IS NOT NULL AND pick_count=1) THEN
      SELECT coalesce(jsonb_agg(CASE WHEN p->>'golfer'=changed_idx::text
       THEN jsonb_set(p,'{team}',to_jsonb(target_team),false) ELSE p END ORDER BY ord),'[]'::jsonb)
       INTO expected_picks FROM jsonb_array_elements(old.state->'picks') WITH ORDINALITY x(p,ord);
      IF old_team IS NULL THEN
       expected_picks:=expected_picks||jsonb_build_array(jsonb_build_object(
         'golfer',changed_idx,'team',target_team,'late',true));
      END IF;
      IF new.state->'picks'=expected_picks THEN RETURN new; END IF;
     END IF;
    END IF;
   END IF;
  END;
 END IF;

 SELECT jsonb_agg(jsonb_build_array(ordinality,value->'name',value->'band',value->'self_ranked') ORDER BY ordinality)
 INTO old_field FROM jsonb_array_elements(old.state->'golfers') WITH ORDINALITY
 WHERE btrim(coalesce(value->>'name',''))<>'' AND coalesce((value->>'participating')::boolean,true);
 SELECT jsonb_agg(jsonb_build_array(ordinality,value->'name',value->'band',value->'self_ranked') ORDER BY ordinality)
 INTO new_field FROM jsonb_array_elements(new.state->'golfers') WITH ORDINALITY
 WHERE btrim(coalesce(value->>'name',''))<>'' AND coalesce((value->>'participating')::boolean,true);
 IF jsonb_array_length(old.state->'picks')>=original_count
    AND old.state->'golfers' IS DISTINCT FROM new.state->'golfers'
 THEN
   RAISE EXCEPTION 'Completed draft golfer changes require an authorized withdrawal or restore';
 END IF;
 IF old_field IS DISTINCT FROM new_field THEN
   RAISE EXCEPTION 'Playing roster and handicap bands are locked until the draft is complete';
 END IF;
 RETURN new;
END $$;
