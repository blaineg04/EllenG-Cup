-- Isolated authorization fixture only. No real tournament data.
BEGIN;
INSERT INTO transfer_fixture.drafts(id,state,owner_id,status) VALUES
 ('gate', jsonb_build_object('draftRules','weighted','picks',jsonb_build_array(0,1),'golfers',jsonb_build_array(jsonb_build_object('name','Captain A','team',0),jsonb_build_object('name','Captain B','team',1))),'commissioner','setup');
INSERT INTO transfer_fixture.tournaments(id,draft_id,status) VALUES ('event','gate','setup');
SELECT transfer_fixture.check_transfer_gate('commissioner','event','gate',
 (SELECT updated_at FROM transfer_fixture.drafts WHERE id='gate'));
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
     IF scenario='incomplete' THEN UPDATE transfer_fixture.drafts SET state=jsonb_set(state,'{picks}','[]'::jsonb) WHERE id='gate'; END IF;
     IF scenario IN ('player','team','pair') THEN
       INSERT INTO transfer_fixture.score_presence VALUES ('event',scenario);
     END IF;
     BEGIN
       PERFORM transfer_fixture.check_transfer_gate(
         CASE WHEN scenario='anonymous' THEN NULL WHEN scenario='other_user' THEN 'stranger' ELSE 'commissioner' END,
         'event',
         CASE WHEN scenario='wrong_draft' THEN 'missing' ELSE 'gate' END,
         CASE WHEN scenario='stale' THEN '2000-01-01'::timestamptz ELSE (SELECT updated_at FROM transfer_fixture.drafts WHERE id='gate') END
       );
       RAISE EXCEPTION 'unexpectedly accepted scenario: %',scenario;
     EXCEPTION WHEN raise_exception THEN
       GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
       IF err LIKE 'unexpectedly accepted scenario:%' THEN RAISE; END IF;
     END;
     IF scenario IN ('player','team','pair') THEN DELETE FROM transfer_fixture.score_presence WHERE tournament_id='event'; END IF;
     IF scenario='live' THEN UPDATE transfer_fixture.tournaments SET status='setup' WHERE id='event'; END IF;
     IF scenario='incomplete' THEN UPDATE transfer_fixture.drafts SET state=jsonb_set(state,'{picks}','[0,1]'::jsonb) WHERE id='gate'; END IF;
   END;
 END LOOP;
END $test$;
ROLLBACK;
