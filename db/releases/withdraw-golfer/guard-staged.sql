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
 differences integer:=0;
BEGIN
 IF old.state->>'draftRules' IS DISTINCT FROM 'weighted' THEN RETURN new; END IF;
 IF new.state->>'draftRules' IS DISTINCT FROM 'weighted' THEN
   RAISE EXCEPTION 'Weighted draft rules cannot be disabled through roster updates';
 END IF;
 SELECT count(*) INTO playing_count FROM jsonb_array_elements(old.state->'golfers')
 WHERE btrim(coalesce(value->>'name',''))<>'' AND coalesce((value->>'participating')::boolean,true);
 -- A completed draft is not a blanket authorization to rewrite golfers.
 -- Keep harmless non-roster updates working, but inspect roster changes below.
 IF jsonb_array_length(old.state->'picks')>=playing_count
    AND old.state->'golfers' IS NOT DISTINCT FROM new.state->'golfers'
 THEN RETURN new; END IF;
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
 -- Narrow single-golfer withdrawal or restore exception, for completed 23-pick tournament.
 IF old.id='elleng-cup'
 AND auth.uid() IS NOT NULL AND old.owner_id=auth.uid()
 AND jsonb_array_length(old.state->'picks')=23
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
 SELECT jsonb_agg(jsonb_build_array(ordinality,value->'name',value->'band',value->'self_ranked') ORDER BY ordinality)
 INTO old_field FROM jsonb_array_elements(old.state->'golfers') WITH ORDINALITY
 WHERE btrim(coalesce(value->>'name',''))<>'' AND coalesce((value->>'participating')::boolean,true);
 SELECT jsonb_agg(jsonb_build_array(ordinality,value->'name',value->'band',value->'self_ranked') ORDER BY ordinality)
 INTO new_field FROM jsonb_array_elements(new.state->'golfers') WITH ORDINALITY
 WHERE btrim(coalesce(value->>'name',''))<>'' AND coalesce((value->>'participating')::boolean,true);
 IF jsonb_array_length(old.state->'picks')>=playing_count
    AND old.state->'golfers' IS DISTINCT FROM new.state->'golfers'
 THEN
   RAISE EXCEPTION 'Completed draft golfer changes require an authorized withdrawal or restore';
 END IF;
 IF old_field IS DISTINCT FROM new_field THEN
   RAISE EXCEPTION 'Playing roster and handicap bands are locked until the draft is complete';
 END IF;
 RETURN new;
END $$;
