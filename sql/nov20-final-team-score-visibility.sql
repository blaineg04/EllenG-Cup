-- EllenG Cup: retain score visibility after tournament status becomes 'final'.
-- REVIEW BEFORE APPLYING. This migration does not change or delete score rows.
-- PostgreSQL RLS restrictive policies are ANDed with permissive policies.
-- A restrictive FOR ALL policy also limits SELECT, even when read policy says true.
--
-- The existing score guard is scoped to setup/live tournaments. Replace it with
-- operation-specific guards, keeping the same existing conditions for writes.
BEGIN;
DROP POLICY IF EXISTS "active live team guard team scores" ON public.elleng_team_scores;

CREATE POLICY "active live team insert guard" ON public.elleng_team_scores
 AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (EXISTS (
  SELECT 1 FROM public.elleng_tournaments t
  WHERE t.id = tournament_id AND team_index >= 0
    AND team_index < t.team_count AND t.status IN ('setup','live')
 ));

CREATE POLICY "active live team update guard" ON public.elleng_team_scores
 AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (EXISTS (
  SELECT 1 FROM public.elleng_tournaments t
  WHERE t.id = tournament_id AND team_index >= 0
    AND team_index < t.team_count AND t.status IN ('setup','live')
 ))
 WITH CHECK (EXISTS (
  SELECT 1 FROM public.elleng_tournaments t
  WHERE t.id = tournament_id AND team_index >= 0
    AND team_index < t.team_count AND t.status IN ('setup','live')
 ));

CREATE POLICY "active live team delete guard" ON public.elleng_team_scores
 AS RESTRICTIVE FOR DELETE TO authenticated
 USING (EXISTS (
  SELECT 1 FROM public.elleng_tournaments t
  WHERE t.id = tournament_id AND team_index >= 0
    AND team_index < t.team_count AND t.status IN ('setup','live')
 ));

-- player scores: finalized results remain readable; changes still require setup/live status.
DROP POLICY IF EXISTS "active live team guard player scores" ON public.elleng_player_hole_scores;
CREATE POLICY "active live player scores insert guard" ON public.elleng_player_hole_scores AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id = elleng_player_hole_scores.tournament_id AND elleng_player_hole_scores.team_index >= 0 AND elleng_player_hole_scores.team_index < t.team_count AND t.status IN ('setup','live')));
CREATE POLICY "active live player scores update guard" ON public.elleng_player_hole_scores AS RESTRICTIVE FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id = elleng_player_hole_scores.tournament_id AND elleng_player_hole_scores.team_index >= 0 AND elleng_player_hole_scores.team_index < t.team_count AND t.status IN ('setup','live'))) WITH CHECK (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id = elleng_player_hole_scores.tournament_id AND elleng_player_hole_scores.team_index >= 0 AND elleng_player_hole_scores.team_index < t.team_count AND t.status IN ('setup','live')));
CREATE POLICY "active live player scores delete guard" ON public.elleng_player_hole_scores AS RESTRICTIVE FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id = elleng_player_hole_scores.tournament_id AND elleng_player_hole_scores.team_index >= 0 AND elleng_player_hole_scores.team_index < t.team_count AND t.status IN ('setup','live')));

-- pair scores: finalized results remain readable; changes still require setup/live status.
DROP POLICY IF EXISTS "active live team guard pair scores" ON public.elleng_pair_hole_scores;
CREATE POLICY "active live pair scores insert guard" ON public.elleng_pair_hole_scores AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id = elleng_pair_hole_scores.tournament_id AND elleng_pair_hole_scores.team_index >= 0 AND elleng_pair_hole_scores.team_index < t.team_count AND t.status IN ('setup','live')));
CREATE POLICY "active live pair scores update guard" ON public.elleng_pair_hole_scores AS RESTRICTIVE FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id = elleng_pair_hole_scores.tournament_id AND elleng_pair_hole_scores.team_index >= 0 AND elleng_pair_hole_scores.team_index < t.team_count AND t.status IN ('setup','live'))) WITH CHECK (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id = elleng_pair_hole_scores.tournament_id AND elleng_pair_hole_scores.team_index >= 0 AND elleng_pair_hole_scores.team_index < t.team_count AND t.status IN ('setup','live')));
CREATE POLICY "active live pair scores delete guard" ON public.elleng_pair_hole_scores AS RESTRICTIVE FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id = elleng_pair_hole_scores.tournament_id AND elleng_pair_hole_scores.team_index >= 0 AND elleng_pair_hole_scores.team_index < t.team_count AND t.status IN ('setup','live')));
COMMIT;
