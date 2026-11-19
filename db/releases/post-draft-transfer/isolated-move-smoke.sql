-- Disposable move RPC integration test; never execute on production.
BEGIN;
INSERT INTO transfer_fixture.drafts(id,state,owner_id,status) VALUES
('move',jsonb_build_object(
 'draftRules','weighted','picks',jsonb_build_array(jsonb_build_object('golfer',2)),
 'golfers',jsonb_build_array(
  jsonb_build_object('name','Captain A','team',0),
  jsonb_build_object('name','Captain B','team',1),
  jsonb_build_object('name','Player A','team',0),
  jsonb_build_object('name','Player B','team',1)),
 'teams',jsonb_build_array(
  jsonb_build_object('captain','Captain A','roster',jsonb_build_array(0,2)),
  jsonb_build_object('captain','Captain B','roster',jsonb_build_array(1,3)))
),'commissioner','completed');
INSERT INTO transfer_fixture.tournaments(id,draft_id,status) VALUES ('move-event','move','setup');
SELECT transfer_fixture.move_golfer('commissioner','move-event','move',
 (SELECT updated_at FROM transfer_fixture.drafts WHERE id='move'),2,1);
DO $verify$
DECLARE s jsonb;
BEGIN
 SELECT state INTO s FROM transfer_fixture.drafts WHERE id='move';
 IF s#>>'{golfers,2,team}' <> '1'
 OR s#>'{teams,0,roster}' <> '[0]'::jsonb
 OR s#>'{teams,1,roster}' <> '[1,3,2]'::jsonb
 THEN RAISE EXCEPTION 'atomic move postcondition failed'; END IF;
END $verify$;
-- An unauthorized attempted move cannot change the state.
DO $verify$
DECLARE before_state jsonb; err text;
BEGIN
 SELECT state INTO before_state FROM transfer_fixture.drafts WHERE id='move';
 BEGIN
  PERFORM transfer_fixture.move_golfer('stranger','move-event','move',
   (SELECT updated_at FROM transfer_fixture.drafts WHERE id='move'),3,0);
  RAISE EXCEPTION 'unexpected unauthorized move success';
 EXCEPTION WHEN raise_exception THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
  IF err='unexpected unauthorized move success' THEN RAISE; END IF;
 END;
 IF (SELECT state FROM transfer_fixture.drafts WHERE id='move') IS DISTINCT FROM before_state
 THEN RAISE EXCEPTION 'rejected move changed state'; END IF;
END $verify$;
-- A stale revision must fail without changing the saved roster.
DO $stale$
DECLARE before_state jsonb; err text;
BEGIN
 SELECT state INTO before_state FROM transfer_fixture.drafts WHERE id='move';
 BEGIN
  PERFORM transfer_fixture.move_golfer('commissioner','move-event','move',
   '2000-01-01'::timestamptz,3,0);
  RAISE EXCEPTION 'unexpected stale move success';
 EXCEPTION WHEN raise_exception THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
  IF err='unexpected stale move success' THEN RAISE; END IF;
 END;
 IF (SELECT state FROM transfer_fixture.drafts WHERE id='move') IS DISTINCT FROM before_state
 THEN RAISE EXCEPTION 'stale move changed state'; END IF;
END $stale$;
-- Any score category must block even a commissioner with a fresh revision.
DO $scores$
DECLARE kind text; before_state jsonb; err text;
BEGIN
 SELECT state INTO before_state FROM transfer_fixture.drafts WHERE id='move';
 FOREACH kind IN ARRAY ARRAY['player','team','pair'] LOOP
  INSERT INTO transfer_fixture.score_presence VALUES ('move-event',kind);
  BEGIN
   PERFORM transfer_fixture.move_golfer('commissioner','move-event','move',
    (SELECT updated_at FROM transfer_fixture.drafts WHERE id='move'),3,0);
   RAISE EXCEPTION 'unexpected scored move success';
  EXCEPTION WHEN raise_exception THEN
   GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
   IF err='unexpected scored move success' THEN RAISE; END IF;
  END;
  DELETE FROM transfer_fixture.score_presence WHERE tournament_id='move-event';
 END LOOP;
 IF (SELECT state FROM transfer_fixture.drafts WHERE id='move') IS DISTINCT FROM before_state
 THEN RAISE EXCEPTION 'scored move changed state'; END IF;
END $scores$;
-- Reject captain, same-team, and out-of-range moves without any mutation.
DO $invalid$
DECLARE scenario text; golfer_index integer; destination integer;
        before_state jsonb; err text;
BEGIN
 SELECT state INTO before_state FROM transfer_fixture.drafts WHERE id='move';
 FOREACH scenario IN ARRAY ARRAY['captain','same_team','bad_destination','bad_golfer','null_golfer','null_destination'] LOOP
  golfer_index:=CASE scenario WHEN 'captain' THEN 0 WHEN 'bad_golfer' THEN 99 WHEN 'null_golfer' THEN NULL ELSE 3 END;
  destination:=CASE scenario WHEN 'same_team' THEN 1 WHEN 'bad_destination' THEN 7 WHEN 'null_destination' THEN NULL ELSE 0 END;
  BEGIN
   PERFORM transfer_fixture.move_golfer('commissioner','move-event','move',
    (SELECT updated_at FROM transfer_fixture.drafts WHERE id='move'),golfer_index,destination);
   RAISE EXCEPTION 'unexpected invalid move success: %',scenario;
  EXCEPTION WHEN raise_exception THEN
   GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
   IF err LIKE 'unexpected invalid move success:%' THEN RAISE; END IF;
  END;
  IF (SELECT state FROM transfer_fixture.drafts WHERE id='move') IS DISTINCT FROM before_state
  THEN RAISE EXCEPTION 'invalid move changed state: %',scenario; END IF;
 END LOOP;
END $invalid$;
-- Object-form rosters must retain their representation on a successful move.
INSERT INTO transfer_fixture.drafts(id,state,owner_id,status)
SELECT 'object-move',
 jsonb_set(
  jsonb_set(
   jsonb_set(state,'{golfers,2,team}','0'::jsonb),
   '{teams,0,roster}',
   '[{"golferIndex":0},{"golferIndex":2}]'::jsonb),
  '{teams,1,roster}',
  '[{"golferIndex":1},{"golferIndex":3}]'::jsonb),
 'commissioner','completed'
FROM transfer_fixture.drafts WHERE id='move';
INSERT INTO transfer_fixture.tournaments(id,draft_id,status)
VALUES ('object-event','object-move','setup');
SELECT transfer_fixture.move_golfer('commissioner','object-event','object-move',
 (SELECT updated_at FROM transfer_fixture.drafts WHERE id='object-move'),2,1);
DO $object$
DECLARE s jsonb;
BEGIN
 SELECT state INTO s FROM transfer_fixture.drafts WHERE id='object-move';
 IF s#>'{teams,0,roster}' IS DISTINCT FROM '[{"golferIndex":0}]'::jsonb
 OR s#>'{teams,1,roster}' IS DISTINCT FROM
  '[{"golferIndex":1},{"golferIndex":3},{"golferIndex":2}]'::jsonb
 OR s#>>'{golfers,2,team}' <> '1'
 THEN RAISE EXCEPTION 'object roster move failed'; END IF;
END $object$;
ROLLBACK;
