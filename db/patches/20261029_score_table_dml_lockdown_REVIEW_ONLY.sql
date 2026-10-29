-- REVIEW ONLY. Install only with all three authenticated RPCs and verified
-- SECURITY DEFINER ownership; never apply this patch on its own.
-- No direct score-table writes are permitted from anon or authenticated.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
 ON TABLE public.elleng_team_scores,
          public.elleng_pair_hole_scores,
          public.elleng_player_hole_scores
 FROM PUBLIC, anon, authenticated;

DO $verify_dml_lockdown$
DECLARE bad_count integer;
BEGIN
 SELECT count(*) INTO bad_count
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
 AND c.relname IN ('elleng_team_scores','elleng_pair_hole_scores','elleng_player_hole_scores')
 AND (
  has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')
 );
 IF bad_count <> 0 THEN
  RAISE EXCEPTION 'NO-GO: score-table DML still available to API roles on % tables',bad_count;
 END IF;
END $verify_dml_lockdown$;
