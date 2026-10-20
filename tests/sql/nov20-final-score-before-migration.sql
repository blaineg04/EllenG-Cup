-- Confirm the disposable fixture reproduces the bug BEFORE the migration.
BEGIN;
SET LOCAL ROLE authenticated;
DO $$
DECLARE t text;
DECLARE n integer;
BEGIN
 FOR t IN SELECT unnest(ARRAY['elleng_team_scores','elleng_player_hole_scores','elleng_pair_hole_scores'])
 LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
  IF n <> 0 THEN RAISE EXCEPTION 'Broken-state fixture did not hide finalized % scores',t; END IF;
 END LOOP;
END $$;
ROLLBACK;
