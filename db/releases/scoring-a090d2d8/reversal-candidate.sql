-- Candidate reversal for scoring source a090d2d8. Test locally before hosted use.
-- Requires frozen scoring and fresh comparison with the captured schema.
BEGIN;
LOCK TABLE public.elleng_drafts, public.elleng_tournaments, public.elleng_team_scores, public.elleng_pair_hole_scores, public.elleng_player_hole_scores IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM public.elleng_team_scores WHERE score>20) THEN RAISE EXCEPTION 'ROLLBACK_BLOCKED: preserve scores above 20 and retain migrated schema; do not delete or truncate records'; END IF; END $guard$;
DROP TRIGGER "elleng_lock_team_parent" ON public."elleng_team_scores";
DROP TRIGGER "elleng_lock_pair_parent" ON public."elleng_pair_hole_scores";
DROP TRIGGER "elleng_lock_player_parent" ON public."elleng_player_hole_scores";
DROP TRIGGER "elleng_enforce_team_score_format" ON public."elleng_team_scores";
DROP TRIGGER "elleng_prevent_scored_draft_format_change" ON public."elleng_drafts";
DROP TRIGGER "elleng_guard_scored_tournament_config" ON public."elleng_tournaments";
DROP FUNCTION public.elleng_test_authorized_scramble(text,integer,integer,integer);
DROP FUNCTION public.elleng_test_authorized_shamble(text,integer,integer,integer,integer);
DROP FUNCTION public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer);
DROP FUNCTION public.elleng_test_commissioner_clear_scores(text);
DROP FUNCTION public.elleng_lock_parent_for_score_write();
DROP FUNCTION public.elleng_enforce_team_score_format();
DROP FUNCTION public.elleng_prevent_scored_draft_format_change();
DROP FUNCTION public.elleng_guard_scored_tournament_config();
ALTER TABLE public.elleng_team_scores DROP CONSTRAINT elleng_team_scores_score_check;
ALTER TABLE public.elleng_team_scores ADD CONSTRAINT elleng_team_scores_score_check CHECK (((score >= 1) AND (score <= 20)));
DO $policies$ DECLARE p record; BEGIN FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('elleng_team_scores','elleng_pair_hole_scores','elleng_player_hole_scores') LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP; END $policies$;
CREATE POLICY "pair_authenticated_read" ON public."elleng_pair_hole_scores" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "pair_team_insert" ON public."elleng_pair_hole_scores" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_drafts d ON ((d.id = t.draft_id)))
  WHERE ((t.id = elleng_pair_hole_scores.tournament_id) AND (d.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_captains c ON ((c.draft_id = t.draft_id)))
  WHERE ((t.id = elleng_pair_hole_scores.tournament_id) AND (c.user_id = auth.uid()) AND (c.team_index = elleng_pair_hole_scores.team_index))))));
CREATE POLICY "pair_team_update" ON public."elleng_pair_hole_scores" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_drafts d ON ((d.id = t.draft_id)))
  WHERE ((t.id = elleng_pair_hole_scores.tournament_id) AND (d.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_captains c ON ((c.draft_id = t.draft_id)))
  WHERE ((t.id = elleng_pair_hole_scores.tournament_id) AND (c.user_id = auth.uid()) AND (c.team_index = elleng_pair_hole_scores.team_index)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_drafts d ON ((d.id = t.draft_id)))
  WHERE ((t.id = elleng_pair_hole_scores.tournament_id) AND (d.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_captains c ON ((c.draft_id = t.draft_id)))
  WHERE ((t.id = elleng_pair_hole_scores.tournament_id) AND (c.user_id = auth.uid()) AND (c.team_index = elleng_pair_hole_scores.team_index))))));
CREATE POLICY "pair_team_delete" ON public."elleng_pair_hole_scores" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_drafts d ON ((d.id = t.draft_id)))
  WHERE ((t.id = elleng_pair_hole_scores.tournament_id) AND (d.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_captains c ON ((c.draft_id = t.draft_id)))
  WHERE ((t.id = elleng_pair_hole_scores.tournament_id) AND (c.user_id = auth.uid()) AND (c.team_index = elleng_pair_hole_scores.team_index))))));
CREATE POLICY "active live pair scores insert guard" ON public."elleng_pair_hole_scores" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM elleng_tournaments t
  WHERE ((t.id = elleng_pair_hole_scores.tournament_id) AND (elleng_pair_hole_scores.team_index >= 0) AND (elleng_pair_hole_scores.team_index < t.team_count) AND (t.status = ANY (ARRAY['setup'::text, 'live'::text]))))));
CREATE POLICY "active live pair scores update guard" ON public."elleng_pair_hole_scores" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM elleng_tournaments t
  WHERE ((t.id = elleng_pair_hole_scores.tournament_id) AND (elleng_pair_hole_scores.team_index >= 0) AND (elleng_pair_hole_scores.team_index < t.team_count) AND (t.status = ANY (ARRAY['setup'::text, 'live'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM elleng_tournaments t
  WHERE ((t.id = elleng_pair_hole_scores.tournament_id) AND (elleng_pair_hole_scores.team_index >= 0) AND (elleng_pair_hole_scores.team_index < t.team_count) AND (t.status = ANY (ARRAY['setup'::text, 'live'::text]))))));
CREATE POLICY "active live pair scores delete guard" ON public."elleng_pair_hole_scores" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM elleng_tournaments t
  WHERE ((t.id = elleng_pair_hole_scores.tournament_id) AND (elleng_pair_hole_scores.team_index >= 0) AND (elleng_pair_hole_scores.team_index < t.team_count) AND (t.status = ANY (ARRAY['setup'::text, 'live'::text]))))));
GRANT INSERT,UPDATE,DELETE,TRUNCATE ON public."elleng_pair_hole_scores" TO anon,authenticated;
CREATE POLICY "shamble_authenticated_read" ON public."elleng_player_hole_scores" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "shamble_team_insert" ON public."elleng_player_hole_scores" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM elleng_drafts d
  WHERE ((d.id = 'elleng-cup'::text) AND (d.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM elleng_captains c
  WHERE ((c.draft_id = 'elleng-cup'::text) AND (c.user_id = auth.uid()) AND (c.team_index = elleng_player_hole_scores.team_index))))));
CREATE POLICY "shamble_team_update" ON public."elleng_player_hole_scores" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM elleng_drafts d
  WHERE ((d.id = 'elleng-cup'::text) AND (d.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM elleng_captains c
  WHERE ((c.draft_id = 'elleng-cup'::text) AND (c.user_id = auth.uid()) AND (c.team_index = elleng_player_hole_scores.team_index)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM elleng_drafts d
  WHERE ((d.id = 'elleng-cup'::text) AND (d.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM elleng_captains c
  WHERE ((c.draft_id = 'elleng-cup'::text) AND (c.user_id = auth.uid()) AND (c.team_index = elleng_player_hole_scores.team_index))))));
CREATE POLICY "shamble_team_delete" ON public."elleng_player_hole_scores" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM elleng_drafts d
  WHERE ((d.id = 'elleng-cup'::text) AND (d.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM elleng_captains c
  WHERE ((c.draft_id = 'elleng-cup'::text) AND (c.user_id = auth.uid()) AND (c.team_index = elleng_player_hole_scores.team_index))))));
CREATE POLICY "active live player scores insert guard" ON public."elleng_player_hole_scores" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM elleng_tournaments t
  WHERE ((t.id = elleng_player_hole_scores.tournament_id) AND (elleng_player_hole_scores.team_index >= 0) AND (elleng_player_hole_scores.team_index < t.team_count) AND (t.status = ANY (ARRAY['setup'::text, 'live'::text]))))));
CREATE POLICY "active live player scores update guard" ON public."elleng_player_hole_scores" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM elleng_tournaments t
  WHERE ((t.id = elleng_player_hole_scores.tournament_id) AND (elleng_player_hole_scores.team_index >= 0) AND (elleng_player_hole_scores.team_index < t.team_count) AND (t.status = ANY (ARRAY['setup'::text, 'live'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM elleng_tournaments t
  WHERE ((t.id = elleng_player_hole_scores.tournament_id) AND (elleng_player_hole_scores.team_index >= 0) AND (elleng_player_hole_scores.team_index < t.team_count) AND (t.status = ANY (ARRAY['setup'::text, 'live'::text]))))));
CREATE POLICY "active live player scores delete guard" ON public."elleng_player_hole_scores" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM elleng_tournaments t
  WHERE ((t.id = elleng_player_hole_scores.tournament_id) AND (elleng_player_hole_scores.team_index >= 0) AND (elleng_player_hole_scores.team_index < t.team_count) AND (t.status = ANY (ARRAY['setup'::text, 'live'::text]))))));
GRANT INSERT,UPDATE,DELETE,TRUNCATE ON public."elleng_player_hole_scores" TO anon,authenticated;
CREATE POLICY "authenticated can read all scores" ON public."elleng_team_scores" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "captain or commissioner inserts own team scores" ON public."elleng_team_scores" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_drafts d ON ((d.id = t.draft_id)))
  WHERE ((t.id = elleng_team_scores.tournament_id) AND (d.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_captains c ON ((c.draft_id = t.draft_id)))
  WHERE ((t.id = elleng_team_scores.tournament_id) AND (c.user_id = auth.uid()) AND (c.team_index = elleng_team_scores.team_index))))));
CREATE POLICY "captain or commissioner updates own team scores" ON public."elleng_team_scores" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_drafts d ON ((d.id = t.draft_id)))
  WHERE ((t.id = elleng_team_scores.tournament_id) AND (d.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_captains c ON ((c.draft_id = t.draft_id)))
  WHERE ((t.id = elleng_team_scores.tournament_id) AND (c.user_id = auth.uid()) AND (c.team_index = elleng_team_scores.team_index)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_drafts d ON ((d.id = t.draft_id)))
  WHERE ((t.id = elleng_team_scores.tournament_id) AND (d.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_captains c ON ((c.draft_id = t.draft_id)))
  WHERE ((t.id = elleng_team_scores.tournament_id) AND (c.user_id = auth.uid()) AND (c.team_index = elleng_team_scores.team_index))))));
CREATE POLICY "captain or commissioner deletes own team scores" ON public."elleng_team_scores" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_drafts d ON ((d.id = t.draft_id)))
  WHERE ((t.id = elleng_team_scores.tournament_id) AND (d.owner_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (elleng_tournaments t
     JOIN elleng_captains c ON ((c.draft_id = t.draft_id)))
  WHERE ((t.id = elleng_team_scores.tournament_id) AND (c.user_id = auth.uid()) AND (c.team_index = elleng_team_scores.team_index))))));
CREATE POLICY "active live team insert guard" ON public."elleng_team_scores" AS RESTRICTIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM elleng_tournaments t
  WHERE ((t.id = elleng_team_scores.tournament_id) AND (elleng_team_scores.team_index >= 0) AND (elleng_team_scores.team_index < t.team_count) AND (t.status = ANY (ARRAY['setup'::text, 'live'::text]))))));
CREATE POLICY "active live team update guard" ON public."elleng_team_scores" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM elleng_tournaments t
  WHERE ((t.id = elleng_team_scores.tournament_id) AND (elleng_team_scores.team_index >= 0) AND (elleng_team_scores.team_index < t.team_count) AND (t.status = ANY (ARRAY['setup'::text, 'live'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM elleng_tournaments t
  WHERE ((t.id = elleng_team_scores.tournament_id) AND (elleng_team_scores.team_index >= 0) AND (elleng_team_scores.team_index < t.team_count) AND (t.status = ANY (ARRAY['setup'::text, 'live'::text]))))));
CREATE POLICY "active live team delete guard" ON public."elleng_team_scores" AS RESTRICTIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM elleng_tournaments t
  WHERE ((t.id = elleng_team_scores.tournament_id) AND (elleng_team_scores.team_index >= 0) AND (elleng_team_scores.team_index < t.team_count) AND (t.status = ANY (ARRAY['setup'::text, 'live'::text]))))));
GRANT INSERT,UPDATE,DELETE,TRUNCATE ON public."elleng_team_scores" TO anon,authenticated;
COMMIT;
