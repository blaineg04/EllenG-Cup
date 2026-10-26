-- Run ONLY against an isolated restored EllenG test database with migrations applied.
-- psql -v ON_ERROR_STOP=1 -d elleng_restore_test -f tests/acceptance/auto-pick-balance-rehearsal.sql
-- Never point this rehearsal at the live Supabase project.
BEGIN;
DO $$
DECLARE
  s jsonb := '{
    "teams":[{"roster":[0,1]},{"roster":[]}],
    "golfers":[
      {"name":"A1","band":"A","team":0},
      {"name":"B1","band":"B","team":0},
      {"name":"A2","band":"A","team":null},
      {"name":"B2","band":"B","team":null},
      {"name":"C1","band":"C","team":null}
    ],
    "draftRules":"banded"
  }'::jsonb;
  choice text;
  best integer := null;
  p integer;
  b text;
BEGIN
  -- Current team 0 already has A and B; C is eligible under minimum
  -- balance penalty, even if older strict-band logic might refuse it.
  FOR b IN SELECT unnest(ARRAY['A','B','C']) LOOP
    p := public.elleng_pick_balance_penalty(s,0,b);
    IF best IS NULL OR p < best THEN best:=p;choice:=b; END IF;
  END LOOP;
  IF choice <> 'C' THEN
    RAISE EXCEPTION 'Unexpected minimum-penalty band: %, penalty %',choice,best;
  END IF;
  RAISE NOTICE 'PASS: automatic pick candidate priority matches manual penalty rule';
END $$;
-- Regression: when the current team already has C, prefer an A/B band
-- rather than selecting a second C while another team has zero C golfers.
DO $
DECLARE
  s jsonb := '{
    "teams":[{"roster":[0]},{"roster":[]}],
    "golfers":[
      {"name":"C1","band":"C","team":0},
      {"name":"A1","band":"A","team":null},
      {"name":"B1","band":"B","team":null},
      {"name":"C2","band":"C","team":null}
    ]
  }'::jsonb;
  a_penalty integer;
  b_penalty integer;
  c_penalty integer;
BEGIN
  a_penalty := public.elleng_pick_balance_penalty(s,0,'A');
  b_penalty := public.elleng_pick_balance_penalty(s,0,'B');
  c_penalty := public.elleng_pick_balance_penalty(s,0,'C');
  IF NOT (a_penalty = b_penalty AND a_penalty < c_penalty) THEN
    RAISE EXCEPTION 'Expected A/B minimum penalty below C; got A %, B %, C %', a_penalty,b_penalty,c_penalty;
  END IF;
  RAISE NOTICE 'PASS: A/B tie wins over duplicate C band';
END $;
ROLLBACK;
