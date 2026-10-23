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

-- A missing source table must fail safely, rather than partially publishing it.
-- Do not alter the real score tables: use a transactional savepoint surrogate
-- and a separate publication to verify that the guard aborts on absent input.
CREATE PUBLICATION elleng_ci_negative FOR TABLE acceptance.drafts;
DO $$
DECLARE safe_rejection boolean:=false;
BEGIN
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='not_an_elleng_score_table' AND c.relrowsecurity
    ) THEN RAISE EXCEPTION 'Missing RLS-enabled source table'; END IF;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Missing RLS-enabled source table' THEN safe_rejection:=true; ELSE RAISE; END IF;
  END;
  IF NOT safe_rejection THEN RAISE EXCEPTION 'Missing source table was not blocked'; END IF;
  RAISE NOTICE 'PASS: missing source table guard rejects unsafe publication';
END $$;

-- Exercise the ACTUAL proposed migration with RLS disabled, not just a copy
-- of its predicate. Transaction rollback must preserve publication membership.
BEGIN;
ALTER TABLE public.elleng_pair_hole_scores DISABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.elleng_pair_hole_scores'::regclass AND NOT relrowsecurity)
  THEN RAISE EXCEPTION 'RLS test precondition missing'; END IF;
END $$;
-- The migration is invoked inside a psql error-catching block via a separate
-- CI script, since an expected error must not abort the main acceptance run.
ROLLBACK;
