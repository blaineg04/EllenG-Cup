-- Isolated authorization fixture only. No real tournament data.
BEGIN;
INSERT INTO transfer_fixture.drafts(id,state,owner_id,status) VALUES
 ('gate', jsonb_build_object('draftRules','weighted','picks',jsonb_build_array(0,1),'golfers',jsonb_build_array(jsonb_build_object('name','Captain A','team',0),jsonb_build_object('name','Captain B','team',1))),'commissioner','setup');
INSERT INTO transfer_fixture.tournaments(id,draft_id,status) VALUES ('event','gate','setup');
-- Create an incomplete draft as a separate immutable fixture, not by editing guarded picks.
INSERT INTO transfer_fixture.drafts(id,state,owner_id,status)
SELECT 'incomplete-gate',jsonb_set(state,'{picks}','[]'::jsonb),owner_id,status
FROM transfer_fixture.drafts WHERE id='gate';
INSERT INTO transfer_fixture.tournaments(id,draft_id,status)
VALUES ('incomplete-event','incomplete-gate','setup');
SELECT transfer_fixture.check_transfer_gate('commissioner','event','gate',
 (SELECT updated_at FROM transfer_fixture.drafts WHERE id='gate'));
-- Live-shaped completion regression: 23 original picks, 19 still participating.
-- A withdrawn original golfer must not make a completed draft appear incomplete.
INSERT INTO transfer_fixture.drafts(id,state,owner_id,status)
SELECT 'withdrawn-complete',
 jsonb_build_object(
  'draftRules','weighted',
  'picks',(SELECT jsonb_agg(i) FROM generate_series(0,22) AS i),
  'golfers',(SELECT jsonb_agg(jsonb_build_object(
    'name','Golfer '||i,'team',i%2,
    'participating',i<19) ORDER BY i)
    FROM generate_series(0,22) AS i)),
 'commissioner','setup';
INSERT INTO transfer_fixture.tournaments(id,draft_id,status)
VALUES ('withdrawn-event','withdrawn-complete','setup');
SELECT transfer_fixture.check_transfer_gate('commissioner','withdrawn-event','withdrawn-complete',
 (SELECT updated_at FROM transfer_fixture.drafts WHERE id='withdrawn-complete'));
-- A draft with only 22 of 23 original picks must be denied.
INSERT INTO transfer_fixture.drafts(id,state,owner_id,status)
SELECT 'one-pick-short',jsonb_set(state,'{picks}',state->'picks' - 22),owner_id,status
FROM transfer_fixture.drafts WHERE id='withdrawn-complete';
INSERT INTO transfer_fixture.tournaments(id,draft_id,status)
VALUES ('short-event','one-pick-short','setup');
DO $short$
DECLARE message text;
BEGIN
 BEGIN
  PERFORM transfer_fixture.check_transfer_gate('commissioner','short-event','one-pick-short',
   (SELECT updated_at FROM transfer_fixture.drafts WHERE id='one-pick-short'));
  RAISE EXCEPTION 'unexpectedly accepted incomplete 22-of-23 draft';
 EXCEPTION WHEN raise_exception THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message='unexpectedly accepted incomplete 22-of-23 draft' THEN RAISE; END IF;
 END;
END $short$;
-- Scores belonging to a different tournament must not block this tournament.
INSERT INTO transfer_fixture.score_presence VALUES ('other-event','player');
SELECT transfer_fixture.check_transfer_gate('commissioner','event','gate',
 (SELECT updated_at FROM transfer_fixture.drafts WHERE id='gate'));
DELETE FROM transfer_fixture.score_presence WHERE tournament_id='other-event';
-- A rejected request must not change the stored draft state or revision.
DO $test$
DECLARE scenario text;
        err text;
BEGIN
 FOR scenario IN SELECT unnest(ARRAY['anonymous','other_user','wrong_draft','stale','live','incomplete','player','team','pair']) LOOP
   BEGIN
     IF scenario='live' THEN UPDATE transfer_fixture.tournaments SET status='live' WHERE id='event'; END IF;
     IF scenario IN ('player','team','pair') THEN
       INSERT INTO transfer_fixture.score_presence VALUES ('event',scenario);
     END IF;
     BEGIN
       PERFORM transfer_fixture.check_transfer_gate(
         CASE WHEN scenario='anonymous' THEN NULL WHEN scenario='other_user' THEN 'stranger' ELSE 'commissioner' END,
         CASE WHEN scenario='incomplete' THEN 'incomplete-event' ELSE 'event' END,
         CASE WHEN scenario='wrong_draft' THEN 'missing' WHEN scenario='incomplete' THEN 'incomplete-gate' ELSE 'gate' END,
         CASE WHEN scenario='stale' THEN '2000-01-01'::timestamptz ELSE (SELECT updated_at FROM transfer_fixture.drafts WHERE id=CASE WHEN scenario='incomplete' THEN 'incomplete-gate' ELSE 'gate' END) END
       );
       RAISE EXCEPTION 'unexpectedly accepted scenario: %',scenario;
     EXCEPTION WHEN raise_exception THEN
       GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
       IF err LIKE 'unexpectedly accepted scenario:%' THEN RAISE; END IF;
     END;
     IF scenario IN ('player','team','pair') THEN DELETE FROM transfer_fixture.score_presence WHERE tournament_id='event'; END IF;
     IF scenario='live' THEN UPDATE transfer_fixture.tournaments SET status='setup' WHERE id='event'; END IF;
   END;
 END LOOP;
END $test$;
ROLLBACK;
