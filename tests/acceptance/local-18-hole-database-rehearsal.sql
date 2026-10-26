-- Offline schema/parallel-golfer rehearsal. ONLY run against local elleng_restore_test.
-- It deliberately rolls back all inserted scores and the local schema migration.
\set ON_ERROR_STOP on
DO $guard$
BEGIN
 IF current_database() <> 'elleng_restore_test' THEN
  RAISE EXCEPTION 'Refusing to run against database %',current_database();
 END IF;
END $guard$;
BEGIN;
ALTER TABLE public.elleng_player_hole_scores
 DROP CONSTRAINT IF EXISTS elleng_player_hole_scores_hole_check;
ALTER TABLE public.elleng_player_hole_scores
 ADD CONSTRAINT elleng_player_hole_scores_hole_check CHECK (hole BETWEEN 1 AND 18);
DO $exercise$
DECLARE n integer;
BEGIN
 INSERT INTO public.elleng_player_hole_scores(tournament_id,hole,team_index,golfer_index,score,updated_at)
 VALUES ('elleng-cup-live',1,0,0,3,now()),('elleng-cup-live',1,0,1,4,now()),
        ('elleng-cup-live',10,0,0,5,now()),('elleng-cup-live',10,0,1,6,now())
 ON CONFLICT(tournament_id,hole,team_index,golfer_index)
 DO UPDATE SET score=excluded.score,updated_at=excluded.updated_at;
 SELECT count(*) INTO n FROM public.elleng_player_hole_scores
 WHERE tournament_id='elleng-cup-live' AND team_index=0 AND hole IN (1,10) AND golfer_index IN (0,1);
 IF n<>4 THEN RAISE EXCEPTION 'Expected four independent golfer rows, found %',n; END IF;
 BEGIN
  INSERT INTO public.elleng_player_hole_scores(tournament_id,hole,team_index,golfer_index,score,updated_at)
  VALUES ('elleng-cup-live',19,0,0,4,now());
  RAISE EXCEPTION 'Hole 19 should be rejected';
 EXCEPTION WHEN check_violation THEN NULL; END;
 RAISE NOTICE 'PASS: holes 1 and 10 save independently, hole 19 rejected';
END $exercise$;
ROLLBACK;
-- Existing baseline schema and data are unchanged after this test.
