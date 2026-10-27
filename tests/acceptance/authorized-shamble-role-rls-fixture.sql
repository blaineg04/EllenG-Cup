\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE elleng_fixture_authenticated NOLOGIN;
CREATE ROLE elleng_fixture_anon NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('elleng.test_uid',true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO elleng_fixture_authenticated,elleng_fixture_anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO elleng_fixture_authenticated,elleng_fixture_anon;
CREATE TABLE public.elleng_drafts(id text PRIMARY KEY,owner_id uuid,state jsonb NOT NULL);
CREATE TABLE public.elleng_captains(draft_id text,user_id uuid,team_index integer);
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY,draft_id text,status text,team_count integer);
CREATE TABLE public.elleng_player_hole_scores(tournament_id text,hole integer,team_index integer,golfer_index integer,score integer,updated_by uuid,updated_at timestamptz,PRIMARY KEY(tournament_id,hole,team_index,golfer_index));
CREATE TABLE public.elleng_team_scores(tournament_id text,team_index integer,hole integer,score integer,updated_by uuid,updated_at timestamptz,PRIMARY KEY(tournament_id,team_index,hole));
INSERT INTO public.elleng_drafts VALUES('draft','00000000-0000-4000-8000-000000000001','{"teams":[{"roster":[0,1]}]}'::jsonb);
INSERT INTO public.elleng_captains VALUES('draft','00000000-0000-4000-8000-000000000002',0);
INSERT INTO public.elleng_tournaments VALUES('fixture','draft','live',1);
\i tests/acceptance/authorized-shamble-rpc-proposal.sql
GRANT SELECT ON public.elleng_drafts,public.elleng_captains,public.elleng_tournaments TO elleng_fixture_authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.elleng_player_hole_scores,public.elleng_team_scores TO elleng_fixture_authenticated;
GRANT EXECUTE ON FUNCTION public.elleng_test_authorized_shamble(text,integer,integer,integer,integer) TO elleng_fixture_authenticated;
ALTER TABLE public.elleng_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elleng_captains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elleng_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elleng_player_hole_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elleng_team_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_draft_read ON public.elleng_drafts FOR SELECT TO elleng_fixture_authenticated USING (true);
CREATE POLICY fixture_captain_read ON public.elleng_captains FOR SELECT TO elleng_fixture_authenticated USING (true);
CREATE POLICY fixture_tournament_read ON public.elleng_tournaments FOR SELECT TO elleng_fixture_authenticated USING (true);
CREATE POLICY fixture_player_read ON public.elleng_player_hole_scores FOR SELECT TO elleng_fixture_authenticated USING (true);
CREATE POLICY fixture_player_insert ON public.elleng_player_hole_scores FOR INSERT TO elleng_fixture_authenticated WITH CHECK (updated_by=auth.uid());
CREATE POLICY fixture_player_update ON public.elleng_player_hole_scores FOR UPDATE TO elleng_fixture_authenticated USING (true) WITH CHECK (updated_by=auth.uid());
CREATE POLICY fixture_player_delete ON public.elleng_player_hole_scores FOR DELETE TO elleng_fixture_authenticated USING (true);
CREATE POLICY fixture_team_read ON public.elleng_team_scores FOR SELECT TO elleng_fixture_authenticated USING (true);
CREATE POLICY fixture_team_insert ON public.elleng_team_scores FOR INSERT TO elleng_fixture_authenticated WITH CHECK (updated_by=auth.uid());
CREATE POLICY fixture_team_update ON public.elleng_team_scores FOR UPDATE TO elleng_fixture_authenticated USING (true) WITH CHECK (updated_by=auth.uid());
CREATE POLICY fixture_team_delete ON public.elleng_team_scores FOR DELETE TO elleng_fixture_authenticated USING (true);
SELECT set_config('elleng.test_uid','00000000-0000-4000-8000-000000000002',false);
SET LOCAL ROLE elleng_fixture_authenticated;
DO $check$
BEGIN
 IF public.elleng_test_authorized_shamble('fixture',0,10,0,3) IS NOT NULL THEN RAISE EXCEPTION 'Incomplete score should be null'; END IF;
 IF public.elleng_test_authorized_shamble('fixture',0,10,1,2)<>2 THEN RAISE EXCEPTION 'Wrong team score'; END IF;
 RAISE NOTICE 'PASS: actual non-owner PostgreSQL role + RLS atomic write';
END $check$;
RESET ROLE;
SELECT set_config('elleng.test_uid','',false);
SET LOCAL ROLE elleng_fixture_anon;
DO $check$
DECLARE denied boolean:=false;
BEGIN
 BEGIN PERFORM public.elleng_test_authorized_shamble('fixture',0,10,0,4);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Anon RPC execution accepted'; END IF;
 RAISE NOTICE 'PASS: anonymous role blocked';
END $check$;
RESET ROLE;
ROLLBACK;
