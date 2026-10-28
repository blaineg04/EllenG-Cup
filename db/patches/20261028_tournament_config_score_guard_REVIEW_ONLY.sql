-- REVIEW ONLY: never execute against the hosted EllenG database without approval.
-- Requires disposable concurrency/RLS acceptance before migration.
-- Server-side race closure for team-count and format changes.
-- Lock ordering for score writers: tournament row first, then draft/score tables.
CREATE OR REPLACE FUNCTION public.elleng_guard_scored_tournament_config()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
 IF NEW.team_count IS DISTINCT FROM OLD.team_count AND
   (EXISTS(SELECT 1 FROM public.elleng_team_scores s WHERE s.tournament_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.elleng_pair_hole_scores s WHERE s.tournament_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.elleng_player_hole_scores s WHERE s.tournament_id=OLD.id))
 THEN
  RAISE EXCEPTION 'Reconcile tournament scores before changing team count' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
-- Tournament UPDATE locks its row, but direct score INSERT currently does not.
-- Install a separate tournament-row lock on ALL score writers before enabling
-- this trigger; otherwise an insert could race with the existence checks.
-- CREATE TRIGGER ... BEFORE UPDATE OF team_count ON public.elleng_tournaments ...
-- This file intentionally does NOT install a trigger.
