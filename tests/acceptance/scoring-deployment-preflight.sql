-- EllenG scoring deployment preflight. READ-ONLY: safe against the connected
-- production database or an isolated clone. Does not install RPCs or write data.
-- Run with psql -X -v ON_ERROR_STOP=1 -f tests/acceptance/scoring-deployment-preflight.sql
WITH function_status AS (
 SELECT expected.rpc_name,
        to_regprocedure('public.' || expected.rpc_name || expected.args) AS signature
 FROM (VALUES
  ('elleng_test_authorized_split_pair','(text,integer,integer,integer,integer)'),
  ('elleng_test_authorized_shamble','(text,integer,integer,integer,integer)')
 ) AS expected(rpc_name,args)
), role_status AS (
 SELECT f.rpc_name,
        f.signature IS NOT NULL AS installed,
        CASE WHEN f.signature IS NULL THEN false
             ELSE has_function_privilege('authenticated',f.signature,'EXECUTE') END AS authenticated_can_execute,
        CASE WHEN f.signature IS NULL THEN false
             ELSE has_function_privilege('anon',f.signature,'EXECUTE') END AS anon_can_execute
 FROM function_status f
)
SELECT rpc_name, installed, authenticated_can_execute, anon_can_execute,
       installed AND authenticated_can_execute AND NOT anon_can_execute AS rpc_gate_pass
FROM role_status ORDER BY rpc_name;

-- Presence of a score table does not prove its RLS/policies are correct.
SELECT c.relname AS score_table, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       has_table_privilege('authenticated',c.oid,'INSERT') AS authenticated_direct_insert,
       has_table_privilege('authenticated',c.oid,'UPDATE') AS authenticated_direct_update,
       has_table_privilege('authenticated',c.oid,'DELETE') AS authenticated_direct_delete
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p')
  AND c.relname IN ('elleng_pair_hole_scores','elleng_player_hole_scores','elleng_team_scores')
ORDER BY c.relname;

-- Inspect actual policy predicates manually before a rollout; role and RLS
-- introspection alone cannot establish an authenticated end-to-end pass.
SELECT tablename,policyname,cmd,roles,qual,with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('elleng_pair_hole_scores','elleng_player_hole_scores','elleng_team_scores')
ORDER BY tablename,policyname;

-- Optional strict gate for an isolated rehearsal environment:
--   psql -X -v ON_ERROR_STOP=1 -v REQUIRE_SCORING_READY=1 -f tests/acceptance/scoring-deployment-preflight.sql
-- Defaults to report-only mode, safe for the current live project.
\if :{?REQUIRE_SCORING_READY}
DO $preflight$
BEGIN
 IF to_regprocedure('public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer)') IS NULL
    OR to_regprocedure('public.elleng_test_authorized_shamble(text,integer,integer,integer,integer)') IS NULL
 THEN RAISE EXCEPTION 'Scoring rehearsal blocked: required RPC missing'; END IF;
 IF NOT has_function_privilege('authenticated','public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer)','EXECUTE')
    OR has_function_privilege('anon','public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.elleng_test_authorized_shamble(text,integer,integer,integer,integer)','EXECUTE')
    OR has_function_privilege('anon','public.elleng_test_authorized_shamble(text,integer,integer,integer,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'Scoring rehearsal blocked: RPC role grants invalid'; END IF;
 IF EXISTS(
  SELECT 1 FROM (VALUES
   ('public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer)'),
   ('public.elleng_test_authorized_shamble(text,integer,integer,integer,integer)')
  ) AS expected(signature)
  JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
  WHERE EXISTS (
   SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
   WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
  )
 ) THEN RAISE EXCEPTION 'Scoring rehearsal blocked: RPC executable by PUBLIC'; END IF;
 IF EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('elleng_pair_hole_scores','elleng_player_hole_scores','elleng_team_scores')
    AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
    AND (coalesce(qual,'') ~ 'draft_id[[:space:]]*=[[:space:]]*''elleng-cup'''
      OR coalesce(with_check,'') ~ 'draft_id[[:space:]]*=[[:space:]]*''elleng-cup''')
 ) THEN RAISE EXCEPTION 'Scoring rehearsal blocked: fixed draft ID in write policy'; END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname IN ('elleng_pair_hole_scores','elleng_player_hole_scores','elleng_team_scores')
       AND c.relkind IN ('r','p') AND c.relrowsecurity)<>3
 THEN RAISE EXCEPTION 'Scoring rehearsal blocked: score table missing or RLS disabled'; END IF;
END $preflight$;
\endif
