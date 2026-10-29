-- READ ONLY. Existing EllenG Supabase project only. This script never mutates data.
-- Release must remain NO-GO until every result is reviewed and authenticated
-- device validation has passed. Test on existing connection with SELECT only.
WITH expected_rpcs(signature) AS (VALUES
 ('public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer)'),
 ('public.elleng_test_authorized_shamble(text,integer,integer,integer,integer)')
), rpcs AS (
 SELECT signature,to_regprocedure(signature) AS oid FROM expected_rpcs
), rpc_checks AS (
 SELECT count(*) FILTER (WHERE oid IS NOT NULL) AS installed,
        count(*) FILTER (WHERE oid IS NOT NULL AND has_function_privilege('anon',oid,'EXECUTE')) AS anon_execute,
        count(*) FILTER (WHERE oid IS NOT NULL AND has_function_privilege('authenticated',oid,'EXECUTE')) AS authenticated_execute,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
          WHERE p.oid=r.oid AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
        )) AS public_execute
 FROM rpcs r
), tables AS (
 SELECT count(*) FILTER (WHERE c.relrowsecurity) AS rls_count,
        count(*) AS found_count
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN
  ('elleng_team_scores','elleng_pair_hole_scores','elleng_player_hole_scores')
  AND c.relkind IN ('r','p')
), direct_writes AS (
 SELECT count(*) FILTER (WHERE has_table_privilege('authenticated',c.oid,'INSERT')
                            OR has_table_privilege('authenticated',c.oid,'UPDATE')
                            OR has_table_privilege('authenticated',c.oid,'DELETE')) AS tables_with_direct_dml
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN
  ('elleng_team_scores','elleng_pair_hole_scores','elleng_player_hole_scores')
)
SELECT installed=2 AS both_rpc_installed,
 authenticated_execute=2 AS authenticated_rpc_grants,
 anon_execute=0 AND public_execute=0 AS no_public_rpc_access,
 found_count=3 AND rls_count=3 AS scoring_rls_enabled,
 tables_with_direct_dml AS tables_with_authenticated_direct_dml,
 CASE WHEN installed<>2 THEN 'NO-GO: required RPC missing'
      WHEN authenticated_execute<>2 OR anon_execute<>0 OR public_execute<>0 THEN 'NO-GO: RPC privileges'
      WHEN found_count<>3 OR rls_count<>3 THEN 'NO-GO: score-table RLS'
      ELSE 'MANUAL REVIEW: direct DML policies, score-format enforcement, backup, rollback and real devices'
 END AS gate
FROM rpc_checks CROSS JOIN tables CROSS JOIN direct_writes;
