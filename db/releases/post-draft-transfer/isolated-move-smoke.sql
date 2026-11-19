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
ROLLBACK;
