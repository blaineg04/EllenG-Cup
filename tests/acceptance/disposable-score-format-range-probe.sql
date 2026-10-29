-- Disposable-only regression proving why a blind 1..40 CHECK expansion is unsafe.
-- This fixture does not touch hosted Supabase and intentionally demonstrates the gap
-- so that a future format-aware guard can be tested before approval.
BEGIN;
CREATE TABLE elleng_score_range_probe (
  format text NOT NULL,
  score integer NOT NULL,
  CONSTRAINT score_check CHECK (score >= 1 AND score <= 20)
);
DO $$
DECLARE rejected boolean := false;
BEGIN
 BEGIN
  INSERT INTO elleng_score_range_probe VALUES ('standard',40);
 EXCEPTION WHEN check_violation THEN rejected := true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Original 20-point team CHECK unexpectedly accepts 40'; END IF;
END $$;
ALTER TABLE elleng_score_range_probe DROP CONSTRAINT score_check;
ALTER TABLE elleng_score_range_probe ADD CONSTRAINT score_check CHECK (score >= 1 AND score <= 40);
INSERT INTO elleng_score_range_probe VALUES ('split_pair',40);
INSERT INTO elleng_score_range_probe VALUES ('standard',40);
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM elleng_score_range_probe WHERE format='standard' AND score=40)
 THEN RAISE EXCEPTION 'Expected widening vulnerability not reproduced'; END IF;
 RAISE NOTICE 'CONFIRMED ROLLOUT BLOCKER: widened CHECK accepts 40 in standard format';
END $$;
-- A format-aware range rule rejects the standard score even after widening.
ALTER TABLE elleng_score_range_probe ADD CONSTRAINT score_format_guard
 CHECK ((format='split_pair' AND score BETWEEN 2 AND 40)
     OR (format<>'split_pair' AND score BETWEEN 1 AND 20)) NOT VALID;
DELETE FROM elleng_score_range_probe WHERE format='standard' AND score=40;
ALTER TABLE elleng_score_range_probe VALIDATE CONSTRAINT score_format_guard;
DO $$
DECLARE rejected boolean := false;
BEGIN
 BEGIN
  INSERT INTO elleng_score_range_probe VALUES ('standard',40);
 EXCEPTION WHEN check_violation THEN rejected := true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Format-aware guard permitted invalid standard score'; END IF;
 INSERT INTO elleng_score_range_probe VALUES ('standard',20);
 INSERT INTO elleng_score_range_probe VALUES ('split_pair',40);
 RAISE NOTICE 'PASS: format-aware disposable probe enforces 20 standard / 40 Split-Pair';
END $$;
ROLLBACK;
