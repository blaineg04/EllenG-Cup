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
-- Score INSERT/UPDATE lock serializes with tournament configuration.
-- Score DELETE only removes rows and cannot add an out-of-range team.
-- IMPORTANT: audit RLS, trigger invoker permissions, and row-lock deadlocks.
CREATE OR REPLACE FUNCTION public.elleng_lock_parent_for_score_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $
DECLARE v_team_count integer;
BEGIN
 SELECT t.team_count INTO v_team_count
 FROM public.elleng_tournaments t WHERE t.id=NEW.tournament_id FOR UPDATE;
 IF v_team_count IS NULL OR NEW.team_index < 0 OR NEW.team_index >= v_team_count THEN
  RAISE EXCEPTION 'Scoring team is outside active tournament' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $;
-- Apply matching BEFORE INSERT OR UPDATE triggers to ALL THREE score tables,
-- alongside BEFORE UPDATE OF team_count on elleng_tournaments, only in an
-- approved, atomic rollout. This file does NOT install any triggers or grants.
