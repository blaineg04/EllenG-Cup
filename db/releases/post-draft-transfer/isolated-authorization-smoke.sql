-- Isolated authorization fixture only. No real tournament data.
BEGIN;
INSERT INTO transfer_fixture.drafts(id,state,owner_id,status) VALUES
 ('gate', '{"golfers":[],"teams":[]}'::jsonb,'commissioner','completed');
INSERT INTO transfer_fixture.tournaments(id,draft_id,status) VALUES ('event','gate','setup');
SELECT transfer_fixture.check_transfer_gate('commissioner','event','gate',
 (SELECT updated_at FROM transfer_fixture.drafts WHERE id='gate'));
DO $test$
DECLARE scenario text;
        err text;
BEGIN
 FOR scenario IN SELECT unnest(ARRAY['anonymous','other_user','wrong_draft','stale','live','incomplete','player','team','pair']) LOOP
   BEGIN
     IF scenario='live' THEN UPDATE transfer_fixture.tournaments SET status='live' WHERE id='event'; END IF;
     IF scenario='incomplete' THEN UPDATE transfer_fixture.drafts SET status='drafting' WHERE id='gate'; END IF;
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
     IF scenario='incomplete' THEN UPDATE transfer_fixture.drafts SET status='completed' WHERE id='gate'; END IF;
   END;
 END LOOP;
END $test$;
ROLLBACK;
