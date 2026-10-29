-- Run against a DISPOSABLE EllenG PostgreSQL test database only.
-- Requires elleng_pick_balance_penalty and elleng_team_ab_count from the
-- current schema, and db/patches/20261028_auto_pick_balance.sql applied there.
-- This script rolls back its transaction; it never changes live tournament data.
BEGIN;
DO $test$
DECLARE
  s jsonb;
  available integer[];
  actual integer[];
  expected integer[];
  min_penalty integer;
  score integer;
  i integer;
  g jsonb;
  band text;
  team_index integer;
  mode text;
  case_name text;
BEGIN
  FOR case_name, team_index, mode, s, expected IN
    SELECT *
    FROM (VALUES
      ('balanced_two_teams', 0, 'banded',
        '{"teams":[{"roster":[]},{"roster":[]}],"golfers":[{"name":"a","band":"A"},{"name":"b","band":"B"},{"name":"c","band":"C"},{"name":"d","band":"D"}]}'::jsonb,
        ARRAY[0,1,2,3]::integer[]),
      ('ab_strength_imbalance', 0, 'banded',
        '{"teams":[{"roster":[0]},{"roster":[]}],"golfers":[{"name":"taken","band":"A","team":0},{"name":"a","band":"A"},{"name":"b","band":"B"},{"name":"c","band":"C"},{"name":"d","band":"D"}]}'::jsonb,
        ARRAY[3,4]::integer[]),
      ('open_ignores_band_penalty', 0, 'open',
        '{"teams":[{"roster":[0]},{"roster":[]}],"golfers":[{"name":"taken","band":"A","team":0},{"name":"a","band":"A"},{"name":"b","band":"B"},{"name":"c","band":"C"},{"name":"d","band":"D"}]}'::jsonb,
        ARRAY[1,2,3,4]::integer[]),
      ('three_teams_partial_roster', 1, 'banded',
        '{"teams":[{"roster":[0]},{"roster":[]},{"roster":[1]}],"golfers":[{"name":"taken A","band":"A","team":0},{"name":"taken B","band":"B","team":2},{"name":"a","band":"A"},{"name":"b","band":"B"},{"name":"c","band":"C"},{"name":"d","band":"D"}]}'::jsonb,
        ARRAY[2,3,4,5]::integer[]),
      ('reject_empty_and_invalid_rank', 0, 'banded',
        '{"teams":[{"roster":[]},{"roster":[]}],"golfers":[{"name":"","band":"A"},{"name":"invalid","band":"X"},{"name":"valid","band":"C"}]}'::jsonb,
        ARRAY[2]::integer[])
    ) v(case_name, team_index, mode, s, expected)
  LOOP
    available := '{}';
    actual := '{}';
    min_penalty := NULL;
    FOR i IN 0..jsonb_array_length(s->'golfers') - 1 LOOP
      g := s->'golfers'->i;
      IF coalesce(g->>'name','') <> '' AND
         (NOT(g ? 'team') OR g->'team' = 'null'::jsonb) THEN
        band := g->>'band';
        IF mode = 'open' THEN
          actual := array_append(actual,i);
        ELSIF band IN ('A','B','C','D') THEN
          score := public.elleng_pick_balance_penalty(s,team_index,band);
          IF min_penalty IS NULL OR score < min_penalty THEN
            min_penalty := score;
            actual := ARRAY[i];
          ELSIF score = min_penalty THEN
            actual := array_append(actual,i);
          END IF;
        END IF;
      END IF;
    END LOOP;
    IF actual IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'Case % failed: expected %, got %',case_name,expected,actual;
    END IF;
    RAISE NOTICE 'PASS: %',case_name;
  END LOOP;
END
$test$;
ROLLBACK;
