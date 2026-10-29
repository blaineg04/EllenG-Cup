-- PROPOSAL ONLY. NEVER APPLY TO LIVE SUPABASE WITHOUT APPROVAL.
-- Review and test on disposable PostgreSQL first.
BEGIN;
DROP POLICY IF EXISTS "active live team insert guard" ON public.elleng_team_scores;
CREATE POLICY "active live team insert guard" ON public.elleng_team_scores AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id=tournament_id AND team_index >= 0 AND team_index < t.team_count AND t.status IN ('setup','live')));
DROP POLICY IF EXISTS "active live team update guard" ON public.elleng_team_scores;
CREATE POLICY "active live team update guard" ON public.elleng_team_scores AS RESTRICTIVE FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id=tournament_id AND team_index >= 0 AND team_index < t.team_count AND t.status IN ('setup','live'))) WITH CHECK (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id=tournament_id AND team_index >= 0 AND team_index < t.team_count AND t.status IN ('setup','live')));
DROP POLICY IF EXISTS "active live team delete guard" ON public.elleng_team_scores;
CREATE POLICY "active live team delete guard" ON public.elleng_team_scores AS RESTRICTIVE FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id=tournament_id AND team_index >= 0 AND team_index < t.team_count AND t.status IN ('setup','live')));
DROP POLICY IF EXISTS "active live player scores insert guard" ON public.elleng_player_hole_scores;
CREATE POLICY "active live player scores insert guard" ON public.elleng_player_hole_scores AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id=tournament_id AND team_index >= 0 AND team_index < t.team_count AND t.status IN ('setup','live')));
DROP POLICY IF EXISTS "active live player scores update guard" ON public.elleng_player_hole_scores;
CREATE POLICY "active live player scores update guard" ON public.elleng_player_hole_scores AS RESTRICTIVE FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id=tournament_id AND team_index >= 0 AND team_index < t.team_count AND t.status IN ('setup','live'))) WITH CHECK (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id=tournament_id AND team_index >= 0 AND team_index < t.team_count AND t.status IN ('setup','live')));
DROP POLICY IF EXISTS "active live player scores delete guard" ON public.elleng_player_hole_scores;
CREATE POLICY "active live player scores delete guard" ON public.elleng_player_hole_scores AS RESTRICTIVE FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id=tournament_id AND team_index >= 0 AND team_index < t.team_count AND t.status IN ('setup','live')));
DROP POLICY IF EXISTS "active live pair scores insert guard" ON public.elleng_pair_hole_scores;
CREATE POLICY "active live pair scores insert guard" ON public.elleng_pair_hole_scores AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id=tournament_id AND team_index >= 0 AND team_index < t.team_count AND t.status IN ('setup','live')));
DROP POLICY IF EXISTS "active live pair scores update guard" ON public.elleng_pair_hole_scores;
CREATE POLICY "active live pair scores update guard" ON public.elleng_pair_hole_scores AS RESTRICTIVE FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id=tournament_id AND team_index >= 0 AND team_index < t.team_count AND t.status IN ('setup','live'))) WITH CHECK (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id=tournament_id AND team_index >= 0 AND team_index < t.team_count AND t.status IN ('setup','live')));
DROP POLICY IF EXISTS "active live pair scores delete guard" ON public.elleng_pair_hole_scores;
CREATE POLICY "active live pair scores delete guard" ON public.elleng_pair_hole_scores AS RESTRICTIVE FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.elleng_tournaments t WHERE t.id=tournament_id AND team_index >= 0 AND team_index < t.team_count AND t.status IN ('setup','live')));
COMMIT;
