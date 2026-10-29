-- REVIEW ONLY. DO NOT APPLY to hosted EllenG without approval, backup,
-- authenticated role tests and the coordinated score-RPC rollout.
-- Replaces the three player-score write policies that currently hardcode
-- draft_id='elleng-cup'. The existing restrictive active-event policies remain.
-- IMPORTANT: these policies by themselves still permit direct Shamble DML;
-- they are a compatibility fix, NOT the final RPC-only security boundary.
BEGIN;
DROP POLICY IF EXISTS shamble_team_insert ON public.elleng_player_hole_scores;
CREATE POLICY shamble_team_insert ON public.elleng_player_hole_scores
 FOR INSERT TO authenticated WITH CHECK (
 EXISTS (
  SELECT 1 FROM public.elleng_tournaments t
  JOIN public.elleng_drafts d ON d.id=t.draft_id
  WHERE t.id=elleng_player_hole_scores.tournament_id
    AND (d.owner_id=(SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM public.elleng_captains c
      WHERE c.draft_id=t.draft_id
        AND c.team_index=elleng_player_hole_scores.team_index
        AND c.user_id=(SELECT auth.uid())
    ))
 ));
DROP POLICY IF EXISTS shamble_team_update ON public.elleng_player_hole_scores;
CREATE POLICY shamble_team_update ON public.elleng_player_hole_scores
 FOR UPDATE TO authenticated
 USING (
 EXISTS (
  SELECT 1 FROM public.elleng_tournaments t
  JOIN public.elleng_drafts d ON d.id=t.draft_id
  WHERE t.id=elleng_player_hole_scores.tournament_id
    AND (d.owner_id=(SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM public.elleng_captains c
      WHERE c.draft_id=t.draft_id
        AND c.team_index=elleng_player_hole_scores.team_index
        AND c.user_id=(SELECT auth.uid())
    ))
 ))
 WITH CHECK (
 EXISTS (
  SELECT 1 FROM public.elleng_tournaments t
  JOIN public.elleng_drafts d ON d.id=t.draft_id
  WHERE t.id=elleng_player_hole_scores.tournament_id
    AND (d.owner_id=(SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM public.elleng_captains c
      WHERE c.draft_id=t.draft_id
        AND c.team_index=elleng_player_hole_scores.team_index
        AND c.user_id=(SELECT auth.uid())
    ))
 ));
DROP POLICY IF EXISTS shamble_team_delete ON public.elleng_player_hole_scores;
CREATE POLICY shamble_team_delete ON public.elleng_player_hole_scores
 FOR DELETE TO authenticated USING (
 EXISTS (
  SELECT 1 FROM public.elleng_tournaments t
  JOIN public.elleng_drafts d ON d.id=t.draft_id
  WHERE t.id=elleng_player_hole_scores.tournament_id
    AND (d.owner_id=(SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM public.elleng_captains c
      WHERE c.draft_id=t.draft_id
        AND c.team_index=elleng_player_hole_scores.team_index
        AND c.user_id=(SELECT auth.uid())
    ))
 ));
COMMIT;
