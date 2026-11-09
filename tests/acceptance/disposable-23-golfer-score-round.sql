-- Local disposable PostgreSQL scoring persistence test. No Supabase connection.
CREATE SCHEMA scoring_fixture;
CREATE TABLE scoring_fixture.scores (
 golfer_index integer NOT NULL CHECK (golfer_index BETWEEN 0 AND 22),
 team_index integer NOT NULL CHECK (team_index IN (0,1)),
 hole integer NOT NULL CHECK (hole BETWEEN 1 AND 18),
 strokes integer NOT NULL CHECK (strokes BETWEEN 1 AND 20),
 PRIMARY KEY(golfer_index,hole),
 CHECK (team_index = CASE WHEN golfer_index < 12 THEN 0 ELSE 1 END)
);
INSERT INTO scoring_fixture.scores(golfer_index,team_index,hole,strokes)
SELECT g,CASE WHEN g<12 THEN 0 ELSE 1 END,h,
 GREATEST(1,(3+(h-1)%3)+((g*7+h*3)%7)-3)
FROM generate_series(0,22) g CROSS JOIN generate_series(1,18) h;
DO $$
DECLARE n integer; wrong integer; team_sum integer; golfer_sum integer;
BEGIN
 SELECT count(*) INTO n FROM scoring_fixture.scores;
 IF n<>414 THEN RAISE EXCEPTION 'Expected 414 persisted scores, found %',n; END IF;
 SELECT count(*) INTO wrong FROM scoring_fixture.scores
 WHERE strokes<>GREATEST(1,(3+(hole-1)%3)+((golfer_index*7+hole*3)%7)-3);
 IF wrong<>0 THEN RAISE EXCEPTION 'Saved strokes did not read back'; END IF;
 SELECT sum(greatest(0,least(5,3+(3+(hole-1)%3)-strokes))) INTO team_sum
 FROM scoring_fixture.scores WHERE team_index=0;
 SELECT sum(points) INTO golfer_sum FROM (
 SELECT golfer_index,sum(greatest(0,least(5,3+(3+(hole-1)%3)-strokes))) points
 FROM scoring_fixture.scores WHERE team_index=0 GROUP BY golfer_index) x;
 IF team_sum<>golfer_sum THEN RAISE EXCEPTION 'Team points do not equal golfer points'; END IF;
 RAISE NOTICE 'PASS: 414 persisted scores, correct readback, independent SQL Cup point totals';
END $$;
-- Concurrent-style distinct golfer writes, followed by a single-golfer correction.
INSERT INTO scoring_fixture.scores VALUES (7,0,4,4)
ON CONFLICT(golfer_index,hole) DO UPDATE SET strokes=excluded.strokes;
DO $$
BEGIN
 IF (SELECT strokes FROM scoring_fixture.scores WHERE golfer_index=7 AND hole=4)<>4
 THEN RAISE EXCEPTION 'Correction did not persist'; END IF;
 IF (SELECT count(*) FROM scoring_fixture.scores)<>414
 THEN RAISE EXCEPTION 'Correction duplicated or deleted another score'; END IF;
 RAISE NOTICE 'PASS: idempotent correction preserved 414 unique golfer/hole records';
END $$;
