-- Disposable PostgreSQL fixture test; run AFTER isolated-trigger-fixture.sql.
-- Entire transaction rolls back. Never run against live Supabase.
BEGIN;
INSERT INTO transfer_fixture.drafts(id,state) VALUES
('case',jsonb_build_object(
 'draftRules','weighted',
 'picks',jsonb_build_array(jsonb_build_object('golfer',2)),
 'golfers',jsonb_build_array(
   jsonb_build_object('name','Captain A','team',0),
   jsonb_build_object('name','Captain B','team',1),
   jsonb_build_object('name','Test A','team',0),
   jsonb_build_object('name','Test B','team',1)),
 'teams',jsonb_build_array(
   jsonb_build_object('captain','Captain A','roster',jsonb_build_array(0,2)),
   jsonb_build_object('captain','Captain B','roster',jsonb_build_array(1,3)))
));
-- Successful synthetic move of Test A (index 2) from team 0 to team 1.
UPDATE transfer_fixture.drafts SET state =
 jsonb_set(
   jsonb_set(
     jsonb_set(state,'{golfers,2,team}','1'::jsonb),
     '{teams,0,roster}','[0]'::jsonb),
   '{teams,1,roster}','[1,3,2]'::jsonb)
 WHERE id='case';
DO $$
BEGIN
 IF (SELECT state#>>'{golfers,2,team}' FROM transfer_fixture.drafts WHERE id='case')<>'1'
 THEN RAISE EXCEPTION 'fixture move failed'; END IF;
END $$;
-- Negative cases are expected to raise, captured by nested exception blocks.
DO $$
BEGIN
 BEGIN
  UPDATE transfer_fixture.drafts SET state=jsonb_set(state,'{picks}','[]'::jsonb) WHERE id='case';
  RAISE EXCEPTION 'FAIL: changed picks unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FAIL: changed picks unexpectedly accepted' THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE transfer_fixture.drafts SET state=jsonb_set(state,'{golfers,2,name}','"Changed"'::jsonb) WHERE id='case';
  RAISE EXCEPTION 'FAIL: golfer name change unexpectedly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='FAIL: golfer name change unexpectedly accepted' THEN RAISE; END IF;
 END;
END $$;
ROLLBACK;
