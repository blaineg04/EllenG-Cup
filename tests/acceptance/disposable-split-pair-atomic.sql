-- Disposable-only fixture for exact staged Split-Pair RPC.
DO $roles$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('elleng.test_actor',true),'')::uuid
$$;
CREATE TABLE public.elleng_drafts(id text primary key,owner_id uuid,state jsonb);
CREATE TABLE public.elleng_captains(draft_id text,user_id uuid,team_index integer);
CREATE TABLE public.elleng_tournaments(id text primary key,draft_id text,status text);
CREATE TABLE public.elleng_pair_hole_scores(
 tournament_id text,hole integer,team_index integer,pair_index integer,score integer,
 updated_by uuid,updated_at timestamptz default now(),
 PRIMARY KEY(tournament_id,hole,team_index,pair_index),
 CHECK(score between 1 and 20)
);
CREATE TABLE public.elleng_team_scores(
 tournament_id text,team_index integer,hole integer,score integer,
 updated_by uuid,updated_at timestamptz default now(),
 PRIMARY KEY(tournament_id,team_index,hole),
 CONSTRAINT elleng_team_scores_score_check CHECK(score between 1 and 20)
);
\i db/patches/20261028_split_pair_team_total_range_REVIEW_ONLY.sql
\i db/patches/20261028_split_pair_atomic_rpc_REVIEW_ONLY.sql
INSERT INTO public.elleng_drafts VALUES
('draft-qa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
 '{"playFormat":"split_pair","teams":[{"roster":[0,1,2,3]}],"golfers":[{"name":"A"},{"name":"B"},{"name":"C"},{"name":"D"}]}');
INSERT INTO public.elleng_tournaments VALUES ('tournament-qa','draft-qa','live');
INSERT INTO public.elleng_captains VALUES
 ('draft-qa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',0);
SELECT set_config('elleng.test_actor','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
DO $$
DECLARE r jsonb;
BEGIN
 SELECT public.elleng_test_authorized_split_pair('tournament-qa',0,12,0,20) INTO r;
 IF r->'team_score'<>'null'::jsonb THEN RAISE EXCEPTION 'First pair prematurely posted'; END IF;
 SELECT public.elleng_test_authorized_split_pair('tournament-qa',0,12,1,20) INTO r;
 IF r->>'team_score'<>'40' THEN RAISE EXCEPTION 'Split pair should total 40: %',r; END IF;
 SELECT public.elleng_test_authorized_split_pair('tournament-qa',0,12,0,NULL) INTO r;
 IF r->'team_score'<>'null'::jsonb OR EXISTS
  (SELECT 1 FROM public.elleng_team_scores WHERE tournament_id='tournament-qa' AND hole=12)
 THEN RAISE EXCEPTION 'Clear must remove team total'; END IF;
END $$;
SELECT set_config('elleng.test_actor','cccccccc-cccc-cccc-cccc-cccccccccccc',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_split_pair('tournament-qa',0,12,0,3);
  RAISE EXCEPTION 'Unauthorized score unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Unauthorized score unexpectedly accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Not authorized to score this team' THEN RAISE; END IF;
 END;
END $$;
SELECT count(*)=0 AS no_unauthorized_pair_write
FROM public.elleng_pair_hole_scores WHERE pair_index=0;

-- An authenticated captain for a different team is not permitted to score team 0.
INSERT INTO public.elleng_captains VALUES
 ('draft-qa','dddddddd-dddd-dddd-dddd-dddddddddddd',1);
SELECT set_config('elleng.test_actor','dddddddd-dddd-dddd-dddd-dddddddddddd',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_split_pair('tournament-qa',0,15,0,5);
  RAISE EXCEPTION 'Cross-team score unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Cross-team score unexpectedly accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Not authorized to score this team' THEN RAISE; END IF;
 END;
END $$;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.elleng_pair_hole_scores WHERE hole=15)
 OR EXISTS (SELECT 1 FROM public.elleng_team_scores WHERE hole=15)
 THEN RAISE EXCEPTION 'Unauthorized cross-team write persisted'; END IF;
END $$;

-- A missing authenticated identity cannot write.
SELECT set_config('elleng.test_actor','',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_split_pair('tournament-qa',0,16,0,5);
  RAISE EXCEPTION 'Anonymous score unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Anonymous score unexpectedly accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Sign in required' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.elleng_pair_hole_scores WHERE hole=16)
 THEN RAISE EXCEPTION 'Anonymous score write persisted'; END IF;
END $$;
-- Completed tournaments must reject writes even from the assigned captain.
UPDATE public.elleng_tournaments SET status='complete' WHERE id='tournament-qa';
SELECT set_config('elleng.test_actor','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_split_pair('tournament-qa',0,17,0,5);
  RAISE EXCEPTION 'Completed tournament score unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Completed tournament score unexpectedly accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Tournament not available' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.elleng_pair_hole_scores WHERE hole=17)
 THEN RAISE EXCEPTION 'Completed tournament write persisted'; END IF;
END $$;
