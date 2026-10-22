-- Test the reviewed Realtime migration on disposable stand-ins, twice.
CREATE SCHEMA IF NOT EXISTS public;
CREATE TABLE public.elleng_player_hole_scores(id integer PRIMARY KEY);
CREATE TABLE public.elleng_pair_hole_scores(id integer PRIMARY KEY);
ALTER TABLE public.elleng_player_hole_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elleng_pair_hole_scores ENABLE ROW LEVEL SECURITY;
CREATE PUBLICATION supabase_realtime FOR TABLE acceptance.drafts;
\i docs/proposed-realtime-publication-migration.sql
\i docs/proposed-realtime-publication-migration.sql
DO $$
DECLARE actual int;
BEGIN
  SELECT count(*) INTO actual FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public'
    AND tablename IN ('elleng_player_hole_scores','elleng_pair_hole_scores');
  IF actual <> 2 THEN RAISE EXCEPTION 'Expected 2 published score tables; found %',actual; END IF;
  RAISE NOTICE 'PASS: guarded migration publishes both score tables and is repeatable';
END $$;
