\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY, status text NOT NULL, team_count integer NOT NULL);
CREATE TABLE public.elleng_player_hole_scores(tournament_id text NOT NULL,hole integer NOT NULL,team_index integer NOT NULL,golfer_index integer NOT NULL,score integer NOT NULL CHECK(score BETWEEN 1 AND 20),updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tournament_id,hole,team_index,golfer_index));
CREATE TABLE public.elleng_team_scores(tournament_id text NOT NULL,team_index integer NOT NULL,hole integer NOT NULL,score integer CHECK(score BETWEEN 1 AND 20),updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tournament_id,team_index,hole));
INSERT INTO public.elleng_tournaments VALUES ('synthetic', 'live', 2);
\i tests/acceptance/atomic-shamble-function-body.sql
DO $tests$
DECLARE v integer;
BEGIN
  v:=public.elleng_test_save_shamble_score('synthetic',0,10,0,3,ARRAY[0,1]);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Incomplete roster should have no team score'; END IF;
  v:=public.elleng_test_save_shamble_score('synthetic',0,10,1,2,ARRAY[0,1]);
  IF v<>2 THEN RAISE EXCEPTION 'Expected low 2, got %',v; END IF;
  v:=public.elleng_test_save_shamble_score('synthetic',0,10,0,4,ARRAY[0,1]);
  IF v<>2 THEN RAISE EXCEPTION 'Expected stable low 2, got %',v; END IF;
  v:=public.elleng_test_save_shamble_score('synthetic',0,10,1,NULL,ARRAY[0,1]);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Clear should remove derived team score'; END IF;
  IF EXISTS (SELECT 1 FROM public.elleng_team_scores) THEN RAISE EXCEPTION 'Derived score remained after clear'; END IF;
  BEGIN
   PERFORM public.elleng_test_save_shamble_score('synthetic',0,19,0,2,ARRAY[0,1]);
   RAISE EXCEPTION 'Hole 19 accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  RAISE NOTICE 'PASS: atomic prototype incomplete/complete/update/clear/invalid hole';
END $tests$;
ROLLBACK;
