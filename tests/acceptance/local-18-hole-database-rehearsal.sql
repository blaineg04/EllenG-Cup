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
 -- Editing one golfer must not overwrite the other golfer's stroke entry.
 UPDATE public.elleng_player_hole_scores SET score=2
 WHERE tournament_id='elleng-cup-live' AND hole=1 AND team_index=0 AND golfer_index=0;
 IF (SELECT score FROM public.elleng_player_hole_scores WHERE tournament_id='elleng-cup-live' AND hole=1 AND team_index=0 AND golfer_index=1)<>4
 THEN RAISE EXCEPTION 'Editing golfer A modified golfer B'; END IF;
 -- Clear only golfer A on hole 10; golfer B must remain.
 DELETE FROM public.elleng_player_hole_scores
 WHERE tournament_id='elleng-cup-live' AND hole=10 AND team_index=0 AND golfer_index=0;
 SELECT count(*) INTO n FROM public.elleng_player_hole_scores
 WHERE tournament_id='elleng-cup-live' AND hole=10 AND team_index=0 AND golfer_index=1;
 IF n<>1 THEN RAISE EXCEPTION 'Clearing golfer A affected golfer B'; END IF;
 -- Separate 18-hole shamble writes must not create a legacy low-ball team score.
 SELECT count(*) INTO n FROM public.elleng_team_scores WHERE tournament_id='elleng-cup-live';
 IF n<>0 THEN RAISE EXCEPTION 'Unexpected legacy team score rows: %',n; END IF;
 RAISE NOTICE 'PASS: holes 1 and 10 independent, invalid hole rejected, edit/clear isolated, no legacy team score';

END $exercise$;
ROLLBACK;
-- Existing baseline schema and data are unchanged after this test.
