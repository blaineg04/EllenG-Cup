-- REVIEW ONLY: coordinated RPC-only migration, never standalone.
-- Old permissive active-event policies must not remain available as an
-- unintended authorization path if table grants change later.
-- The four authorized SECURITY DEFINER RPCs enforce their own team access.
DROP POLICY IF EXISTS "active live team delete guard" ON public.elleng_team_scores;
DROP POLICY IF EXISTS "active live team insert guard" ON public.elleng_team_scores;
DROP POLICY IF EXISTS "active live team update guard" ON public.elleng_team_scores;
DROP POLICY IF EXISTS "active live pair scores delete guard" ON public.elleng_pair_hole_scores;
DROP POLICY IF EXISTS "active live pair scores insert guard" ON public.elleng_pair_hole_scores;
DROP POLICY IF EXISTS "active live pair scores update guard" ON public.elleng_pair_hole_scores;
DROP POLICY IF EXISTS "active live player scores delete guard" ON public.elleng_player_hole_scores;
DROP POLICY IF EXISTS "active live player scores insert guard" ON public.elleng_player_hole_scores;
DROP POLICY IF EXISTS "active live player scores update guard" ON public.elleng_player_hole_scores;
DO $policy_gate$
BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname='public'
   AND tablename IN ('elleng_team_scores','elleng_pair_hole_scores','elleng_player_hole_scores')
   AND policyname LIKE 'active live % guard'
 ) THEN RAISE EXCEPTION 'NO-GO: legacy broad score write policy still present'; END IF;
END $policy_gate$;
