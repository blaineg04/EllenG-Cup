-- Disposable two-golfer swap integration tests.
BEGIN;
INSERT INTO transfer_fixture.drafts(id,state,owner_id,status)
VALUES ('swap',jsonb_build_object(
 'draftRules','weighted','picks','[]'::jsonb,
 'golfers',jsonb_build_array(
 jsonb_build_object('name','Captain A','team',0),
 jsonb_build_object('name','Captain B','team',1),
 jsonb_build_object('name','Player A','team',0),
 jsonb_build_object('name','Player B','team',1)),
 'teams',jsonb_build_array(
 jsonb_build_object('captain','Captain A','roster',jsonb_build_array(0,2)),
 jsonb_build_object('captain','Captain B','roster',jsonb_build_array(1,3)))
),'commissioner','completed');
INSERT INTO transfer_fixture.tournaments VALUES ('swap-event','swap','setup');
SELECT transfer_fixture.swap_golfers('commissioner','swap-event','swap',
 (SELECT updated_at FROM transfer_fixture.drafts WHERE id='swap'),2,3);
DO $verify$
DECLARE s jsonb;
BEGIN
 SELECT state INTO s FROM transfer_fixture.drafts WHERE id='swap';
 IF s#>'{teams,0,roster}' IS DISTINCT FROM '[0,3]'::jsonb
 OR s#>'{teams,1,roster}' IS DISTINCT FROM '[1,2]'::jsonb
 OR s#>>'{golfers,2,team}' <> '1'
 OR s#>>'{golfers,3,team}' <> '0'
 THEN RAISE EXCEPTION 'swap postcondition failed'; END IF;
END $verify$;
DO $reject$
DECLARE before_state jsonb; scenario text; first_idx integer; second_idx integer; actor text; err text;
BEGIN
 SELECT state INTO before_state FROM transfer_fixture.drafts WHERE id='swap';
 FOREACH scenario IN ARRAY ARRAY['captain','same_team','same_golfer','unauthorized','stale'] LOOP
  first_idx:=CASE WHEN scenario='captain' THEN 0 ELSE 2 END;
  second_idx:=CASE WHEN scenario='same_team' THEN 1 WHEN scenario='same_golfer' THEN 2 ELSE 3 END;
  actor:=CASE WHEN scenario='unauthorized' THEN 'stranger' ELSE 'commissioner' END;
  BEGIN
   PERFORM transfer_fixture.swap_golfers(actor,'swap-event','swap',
    CASE WHEN scenario='stale' THEN '2000-01-01'::timestamptz
    ELSE (SELECT updated_at FROM transfer_fixture.drafts WHERE id='swap') END,
    first_idx,second_idx);
   RAISE EXCEPTION 'unexpected swap success: %',scenario;
  EXCEPTION WHEN raise_exception THEN
   GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
   IF err LIKE 'unexpected swap success:%' THEN RAISE; END IF;
  END;
  IF (SELECT state FROM transfer_fixture.drafts WHERE id='swap') IS DISTINCT FROM before_state
  THEN RAISE EXCEPTION 'rejected swap changed state: %',scenario; END IF;
 END LOOP;
END $reject$;
ROLLBACK;
