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
CREATE TABLE public.elleng_tournaments(id text primary key,draft_id text,status text,team_count integer);
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
INSERT INTO public.elleng_tournaments VALUES ('tournament-qa','draft-qa','live',1);
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

-- Restore reusable fixture for the subsequent two-session concurrency tests.
UPDATE public.elleng_tournaments SET status='live' WHERE id='tournament-qa';

-- Even the owner cannot post a score for a team outside the configured count.
SELECT set_config('elleng.test_actor','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_split_pair('tournament-qa',1,18,0,4);
  RAISE EXCEPTION 'Out-of-range team unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Out-of-range team unexpectedly accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Team is outside active tournament' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.elleng_pair_hole_scores WHERE hole=18)
 THEN RAISE EXCEPTION 'Out-of-range team write persisted'; END IF;
END $$;

-- A tournament switched away from Split-Pair must reject further pair writes.
UPDATE public.elleng_drafts
SET state=jsonb_set(state,'{playFormat}','"standard"'::jsonb)
WHERE id='draft-qa';
SELECT set_config('elleng.test_actor','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
DO $$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_split_pair('tournament-qa',0,18,0,5);
  RAISE EXCEPTION 'Wrong-format score unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Wrong-format score unexpectedly accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Split-Pair format not selected' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.elleng_pair_hole_scores WHERE hole=18)
 THEN RAISE EXCEPTION 'Wrong-format score write persisted'; END IF;
END $$;
UPDATE public.elleng_drafts
SET state=jsonb_set(state,'{playFormat}','"split_pair"'::jsonb)
WHERE id='draft-qa';

-- An invalid hole, pair index, or score must fail before any score mutation.
SELECT set_config('elleng.test_actor','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
DO $$
DECLARE bad integer[];
BEGIN
 FOREACH bad SLICE 1 IN ARRAY ARRAY[[0,0,5],[19,0,5],[18,2,5],[18,0,0],[18,0,21]] LOOP
  BEGIN
   PERFORM public.elleng_test_authorized_split_pair('tournament-qa',0,bad[1],bad[2],bad[3]);
   RAISE EXCEPTION 'Invalid score request unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM='Invalid score request unexpectedly accepted' THEN RAISE; END IF;
   IF SQLERRM<>'Invalid Split-Pair score request' THEN RAISE; END IF;
  END;
 END LOOP;
 IF EXISTS (SELECT 1 FROM public.elleng_pair_hole_scores WHERE hole=18)
 THEN RAISE EXCEPTION 'Invalid request wrote pair score'; END IF;
END $$;

-- Repeated identical saves are idempotent: one pair row, one exact team total.
SELECT set_config('elleng.test_actor','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
DO $$
DECLARE r jsonb;
BEGIN
 SELECT public.elleng_test_authorized_split_pair('tournament-qa',0,18,0,9) INTO r;
 SELECT public.elleng_test_authorized_split_pair('tournament-qa',0,18,0,9) INTO r;
 IF (SELECT count(*) FROM public.elleng_pair_hole_scores
     WHERE tournament_id='tournament-qa' AND hole=18 AND team_index=0 AND pair_index=0)<>1
 THEN RAISE EXCEPTION 'Duplicate pair row from retry'; END IF;
 SELECT public.elleng_test_authorized_split_pair('tournament-qa',0,18,1,8) INTO r;
 SELECT public.elleng_test_authorized_split_pair('tournament-qa',0,18,1,8) INTO r;
 IF r->>'team_score'<>'17' OR
    (SELECT count(*) FROM public.elleng_team_scores WHERE tournament_id='tournament-qa' AND hole=18)<>1
 THEN RAISE EXCEPTION 'Idempotent retry changed team total'; END IF;
END $$;

-- A malformed draft roster must fail without changing either score table.
UPDATE public.elleng_drafts SET state=jsonb_set(state,'{teams,0,roster}','[0,0,2,3]'::jsonb) WHERE id='draft-qa';
SELECT set_config('elleng.test_actor','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
DO $$
DECLARE before_pair integer;
DECLARE before_team integer;
BEGIN
 SELECT count(*) INTO before_pair FROM public.elleng_pair_hole_scores WHERE tournament_id='tournament-qa' AND hole=18;
 SELECT count(*) INTO before_team FROM public.elleng_team_scores WHERE tournament_id='tournament-qa' AND hole=18;
 BEGIN
  PERFORM public.elleng_test_authorized_split_pair('tournament-qa',0,18,0,11);
  RAISE EXCEPTION 'Duplicate roster unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Duplicate roster unexpectedly accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Invalid or duplicate roster golfer' THEN RAISE; END IF;
 END;
 IF before_pair<>(SELECT count(*) FROM public.elleng_pair_hole_scores WHERE tournament_id='tournament-qa' AND hole=18)
 OR before_team<>(SELECT count(*) FROM public.elleng_team_scores WHERE tournament_id='tournament-qa' AND hole=18)
 OR (SELECT score FROM public.elleng_pair_hole_scores WHERE tournament_id='tournament-qa' AND hole=18 AND pair_index=0)<>9
 THEN RAISE EXCEPTION 'Invalid roster altered existing score'; END IF;
END $$;
UPDATE public.elleng_drafts SET state=jsonb_set(state,'{teams,0,roster}','[0,1,2,3]'::jsonb) WHERE id='draft-qa';

-- Verify actual PostgreSQL RPC grants, not only the simulated auth.uid().
DO $$
BEGIN
 IF has_function_privilege('anon','public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'Anonymous role can execute scoring RPC'; END IF;
 IF NOT has_function_privilege('authenticated','public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'Authenticated role cannot execute scoring RPC'; END IF;
END $$;
-- Run through the authenticated SQL role, with no direct pair/team table privileges.
SELECT set_config('elleng.test_actor','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
SET ROLE authenticated;
SELECT public.elleng_test_authorized_split_pair('tournament-qa',0,17,0,7);
RESET ROLE;
DO $$
BEGIN
 IF (SELECT score FROM public.elleng_pair_hole_scores
     WHERE tournament_id='tournament-qa' AND hole=17 AND pair_index=0)<>7
 THEN RAISE EXCEPTION 'Authenticated RPC role failed to persist score'; END IF;
END $$;

-- Authenticated clients must use the authorized RPC, not write score tables directly.
DO $$
BEGIN
 IF has_table_privilege('authenticated','public.elleng_pair_hole_scores','INSERT,UPDATE,DELETE')
 OR has_table_privilege('authenticated','public.elleng_team_scores','INSERT,UPDATE,DELETE')
 THEN RAISE EXCEPTION 'Authenticated role has direct score-table write grants'; END IF;
END $$;
SET ROLE authenticated;
DO $$
BEGIN
 BEGIN
  INSERT INTO public.elleng_pair_hole_scores(tournament_id,hole,team_index,pair_index,score)
  VALUES ('tournament-qa',16,0,0,3);
  RAISE EXCEPTION 'Direct score-table write unexpectedly accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.elleng_pair_hole_scores WHERE hole=16)
 THEN RAISE EXCEPTION 'Direct table write bypassed RPC authorization'; END IF;
END $$;

-- Exercise anonymous denial under the actual SQL role, not only via privilege introspection.
SET ROLE anon;
DO $$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_split_pair('tournament-qa',0,16,0,5);
  RAISE EXCEPTION 'Anonymous SQL role unexpectedly executed scoring RPC';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.elleng_pair_hole_scores WHERE hole=16)
 THEN RAISE EXCEPTION 'Anonymous SQL role wrote pair score'; END IF;
END $$;
