-- REVIEW ONLY: proposed format-aware team-score guard.
-- NEVER apply to hosted Supabase without owner/RLS/locking review and approval.
-- Must be installed ATOMICALLY alongside widened 1..40 CHECK, both RPCs,
-- and reviewed tournament/draft locking. By itself does not close races.
CREATE OR REPLACE FUNCTION public.elleng_enforce_team_score_format()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
DECLARE v_format text;
        v_draft_id text;
BEGIN
 -- Lock the parent draft in SHARE mode before reading its format.
 -- This conflicts with concurrent UPDATE OF state and prevents a stale
 -- format read racing with the draft-format change guard.
 SELECT t.draft_id INTO v_draft_id FROM public.elleng_tournaments t
 WHERE t.id=NEW.tournament_id;
 IF v_draft_id IS NULL THEN RAISE EXCEPTION 'Tournament missing' USING ERRCODE='23514'; END IF;
 SELECT coalesce(d.state->>'playFormat','standard') INTO v_format
 FROM public.elleng_drafts d WHERE d.id=v_draft_id FOR SHARE;
 IF v_format IS NULL OR v_format NOT IN ('standard','elleng','split_pair') THEN
   RAISE EXCEPTION 'Unsupported tournament scoring format' USING ERRCODE='23514';
 END IF;
 IF NEW.score IS NOT NULL AND
    ((v_format='split_pair' AND NEW.score NOT BETWEEN 2 AND 40)
      OR (v_format<>'split_pair' AND NEW.score NOT BETWEEN 1 AND 20)) THEN
   RAISE EXCEPTION 'Team score outside tournament format range' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $guard$;
-- Proposed trigger DDL, deliberately not installed by this file:
-- CREATE TRIGGER elleng_enforce_team_score_format
-- BEFORE INSERT OR UPDATE ON public.elleng_team_scores
-- FOR EACH ROW EXECUTE FUNCTION public.elleng_enforce_team_score_format();
-- Beware: captain execution as SECURITY INVOKER requires permission to
-- SELECT tournaments and drafts. Parent row locking is a separate gate.

-- Guard format changes on the draft itself, including transitions where
-- an existing score happens to fall inside both numeric ranges.
-- Concurrent score writes must also lock the parent draft/tournament:
-- this trigger alone does not establish a cross-table serialization guarantee.
CREATE OR REPLACE FUNCTION public.elleng_prevent_scored_draft_format_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
BEGIN
 IF coalesce(NEW.state->>'playFormat','standard') IS DISTINCT FROM
    coalesce(OLD.state->>'playFormat','standard')
 AND EXISTS (
   SELECT 1 FROM public.elleng_tournaments t WHERE t.draft_id=OLD.id
   AND (EXISTS(SELECT 1 FROM public.elleng_team_scores s WHERE s.tournament_id=t.id)
     OR EXISTS(SELECT 1 FROM public.elleng_pair_hole_scores p WHERE p.tournament_id=t.id)
     OR EXISTS(SELECT 1 FROM public.elleng_player_hole_scores g WHERE g.tournament_id=t.id))
 ) THEN
   RAISE EXCEPTION 'Cannot change format after tournament scoring begins' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $guard$;
-- Install with reviewed migrations only:
-- CREATE TRIGGER elleng_prevent_scored_draft_format_change
-- BEFORE UPDATE OF state ON public.elleng_drafts
-- FOR EACH ROW EXECUTE FUNCTION public.elleng_prevent_scored_draft_format_change();
