-- Executed only in an ephemeral PostgreSQL database. Never Supabase.
-- Simulate an authenticated golfer using a transaction-local session setting.
CREATE SCHEMA concurrency_fixture;
CREATE TABLE concurrency_fixture.scores (
 golfer_id integer NOT NULL CHECK (golfer_id BETWEEN 0 AND 22),
 hole integer NOT NULL CHECK (hole BETWEEN 1 AND 18),
 strokes integer NOT NULL CHECK (strokes BETWEEN 1 AND 20),
 PRIMARY KEY (golfer_id,hole)
);
CREATE FUNCTION concurrency_fixture.save_score(p_golfer integer,p_hole integer,p_strokes integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE actor text:=current_setting('elleng.fixture_actor',true);
BEGIN
 IF actor IS NULL OR actor='' OR actor !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF actor::integer<>p_golfer THEN RAISE EXCEPTION 'Cannot edit another golfer score'; END IF;
 INSERT INTO concurrency_fixture.scores VALUES (p_golfer,p_hole,p_strokes)
 ON CONFLICT (golfer_id,hole) DO UPDATE SET strokes=EXCLUDED.strokes;
END $$;
-- 23 synthetic sessions, each responsible for 18 scores.
DO $$
DECLARE g integer;h integer;
BEGIN
 FOR g IN 0..22 LOOP
  PERFORM set_config('elleng.fixture_actor',g::text,true);
  FOR h IN 1..18 LOOP
   PERFORM concurrency_fixture.save_score(g,h,3+((g+h)%4));
  END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM concurrency_fixture.scores)<>414 THEN RAISE EXCEPTION '414 scores not saved'; END IF;
 RAISE NOTICE 'PASS: 23 synthetic actors saved 414 scores';
END $$;
-- Invalid identity and cross-golfer changes must fail without altering rows.
DO $$
DECLARE before_score integer;
BEGIN
 SELECT strokes INTO before_score FROM concurrency_fixture.scores WHERE golfer_id=1 AND hole=1;
 PERFORM set_config('elleng.fixture_actor','0',true);
 BEGIN
  PERFORM concurrency_fixture.save_score(1,1,19);
  RAISE EXCEPTION 'Cross-golfer write wrongly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Cross-golfer write wrongly accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Cannot edit another golfer score' THEN RAISE; END IF;
 END;
 PERFORM set_config('elleng.fixture_actor','',true);
 BEGIN
  PERFORM concurrency_fixture.save_score(1,1,19);
  RAISE EXCEPTION 'Unsigned write wrongly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Unsigned write wrongly accepted' THEN RAISE; END IF;
  IF SQLERRM<>'Sign in required' THEN RAISE; END IF;
 END;
 IF (SELECT strokes FROM concurrency_fixture.scores WHERE golfer_id=1 AND hole=1)<>before_score
 THEN RAISE EXCEPTION 'Rejected write modified saved score'; END IF;
 IF (SELECT count(*) FROM concurrency_fixture.scores)<>414
 THEN RAISE EXCEPTION 'Rejected write changed record count'; END IF;
 RAISE NOTICE 'PASS: unauthorized and unsigned edits rejected, saved scores preserved';
END $$;
