-- REVIEW ONLY. DO NOT APPLY to production before isolated authenticated tests.
-- EllenG Cup Realtime coverage, 2026-10-22. Never run against FairwayOS.
-- Precondition: commissioner approves publishing player/pair scores to all
-- authenticated users permitted by their current SELECT RLS policies.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['elleng_player_hole_scores','elleng_pair_hole_scores'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relkind IN ('r','p') AND c.relrowsecurity
    ) THEN RAISE EXCEPTION 'Missing RLS-enabled source table: %',t; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
    END IF;
  END LOOP;
END $$;
-- Read-only verification after the reviewed migration:
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname='supabase_realtime' AND schemaname='public'
--   AND tablename IN ('elleng_player_hole_scores','elleng_pair_hole_scores');
-- Rollback requires a separately reviewed DROP TABLE FROM PUBLICATION,
-- only for tables added by this deployment.
