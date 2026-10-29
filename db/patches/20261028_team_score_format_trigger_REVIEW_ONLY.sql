-- REVIEW ONLY: proposed format-aware team-score guard.
-- NEVER apply to hosted Supabase without owner/RLS/locking review and approval.
-- Must be installed ATOMICALLY alongside widened 1..40 CHECK, both RPCs,
-- and reviewed tournament/draft locking. By itself does not close races.
CREATE OR REPLACE FUNCTION public.elleng_enforce_team_score_format()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
DECLARE v_format text;
BEGIN
 SELECT coalesce(d.state->>'playFormat','standard') INTO v_format
 FROM public.elleng_tournaments t JOIN public.elleng_drafts d ON d.id=t.draft_id
 WHERE t.id=NEW.tournament_id;
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
