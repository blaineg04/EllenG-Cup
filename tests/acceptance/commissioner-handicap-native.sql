\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('elleng.test_uid',true),'')::uuid $$;
CREATE TABLE public.elleng_drafts(id text primary key, owner_id uuid, state jsonb, status text, updated_at timestamptz);
CREATE TABLE public.elleng_tournaments(id text primary key, draft_id text, status text);
CREATE TABLE public.elleng_team_scores(tournament_id text);
CREATE TABLE public.elleng_player_hole_scores(tournament_id text);
CREATE TABLE public.elleng_pair_hole_scores(tournament_id text);
CREATE ROLE authenticated;
CREATE ROLE anon;
\ir ../../db/releases/commissioner-handicap/install.sql
INSERT INTO public.elleng_tournaments VALUES ('elleng-cup-live','elleng-cup','setup');
INSERT INTO public.elleng_drafts VALUES ('elleng-cup','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{"timerPaused":true,"golfers":[{"name":"Test Golfer","band":"","hcp":""}],"teams":[{"name":"Keep Team"}]}','setup','2026-11-09T00:00:00Z');
SELECT set_config('elleng.test_uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
DO $$
DECLARE result jsonb; previous timestamptz; saved jsonb;
BEGIN
 SELECT updated_at INTO previous FROM public.elleng_drafts WHERE id='elleng-cup';
 SELECT public.elleng_set_commissioner_handicap('elleng-cup','elleng-cup-live',0,'12.5','','2026-11-09T00:00:00Z') INTO result;
 SELECT state INTO saved FROM public.elleng_drafts WHERE id='elleng-cup';
 IF result->>'band' <> 'B' OR saved->'golfers'->0->>'hcp' <> '12.5' OR saved->'golfers'->0->>'self_ranked' <> 'true' THEN RAISE EXCEPTION 'handicap save failed'; END IF;
 IF saved->'teams'->0->>'name' <> 'Keep Team' THEN RAISE EXCEPTION 'team changed'; END IF;
 BEGIN
 PERFORM public.elleng_set_commissioner_handicap('elleng-cup','elleng-cup-live',0,'13','','2026-11-09T00:00:00Z');
 RAISE EXCEPTION 'stale save unexpectedly succeeded';
 EXCEPTION WHEN serialization_failure THEN NULL;
 END;
END $$;
SELECT set_config('elleng.test_uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
DO $$
BEGIN
 BEGIN
 PERFORM public.elleng_set_commissioner_handicap('elleng-cup','elleng-cup-live',0,'10','','2026-11-09T00:00:00Z');
 RAISE EXCEPTION 'unauthorized save unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
SELECT 'PASS commissioner handicap native PostgreSQL contract' AS result;
