-- Disposable PostgreSQL only. Tests the real proposed Shamble policy SQL.
BEGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
DO $roles$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $roles$;
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY,draft_id text NOT NULL);
CREATE TABLE public.elleng_drafts(id text PRIMARY KEY,owner_id uuid NOT NULL);
CREATE TABLE public.elleng_captains(draft_id text NOT NULL,team_index integer NOT NULL,user_id uuid NOT NULL);
CREATE TABLE public.elleng_player_hole_scores(tournament_id text,team_index integer,hole integer,score integer);
ALTER TABLE public.elleng_player_hole_scores ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT ON public.elleng_tournaments,public.elleng_drafts,public.elleng_captains TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.elleng_player_hole_scores TO authenticated;
CREATE POLICY read_scores ON public.elleng_player_hole_scores FOR SELECT TO authenticated USING(true);
INSERT INTO public.elleng_drafts VALUES
 ('draft-a','00000000-0000-0000-0000-000000000001'),
 ('draft-b','00000000-0000-0000-0000-000000000002');
INSERT INTO public.elleng_tournaments VALUES ('event-a','draft-a'),('event-b','draft-b');
INSERT INTO public.elleng_captains VALUES
 ('draft-a',0,'00000000-0000-0000-0000-000000000003'),
 ('draft-b',1,'00000000-0000-0000-0000-000000000004');
\i db/patches/20261028_shamble_dynamic_draft_policies_REVIEW_ONLY.sql
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
INSERT INTO public.elleng_player_hole_scores VALUES ('event-a',0,10,5);
DO $check$ BEGIN
 BEGIN
  INSERT INTO public.elleng_player_hole_scores VALUES ('event-b',0,10,5);
  RAISE EXCEPTION 'FAIL: captain a inserted into tournament b';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.elleng_player_hole_scores VALUES ('event-a',1,10,5);
  RAISE EXCEPTION 'FAIL: captain a inserted into another team';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $check$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
INSERT INTO public.elleng_player_hole_scores VALUES ('event-b',1,10,5);
DO $check$ DECLARE n integer; BEGIN
 UPDATE public.elleng_player_hole_scores SET score=9 WHERE tournament_id='event-a';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'FAIL: captain b updated tournament a'; END IF;
 DELETE FROM public.elleng_player_hole_scores WHERE tournament_id='event-a';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'FAIL: captain b deleted tournament a'; END IF;
END $check$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
UPDATE public.elleng_player_hole_scores SET score=7 WHERE tournament_id='event-b';
DO $check$ BEGIN
 IF (SELECT score FROM public.elleng_player_hole_scores WHERE tournament_id='event-b')<>7
 THEN RAISE EXCEPTION 'FAIL: commissioner b cannot update own event'; END IF;
END $check$;
RESET ROLE;
ROLLBACK;
