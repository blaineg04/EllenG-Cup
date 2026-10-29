-- EllenG live score-bypass inventory; READ-ONLY, never applies DDL.
-- Intended for approval review before any scoring RPC migration.
WITH protected AS (
 SELECT c.oid,c.relname,c.relrowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
 AND c.relname IN ('elleng_team_scores','elleng_player_hole_scores','elleng_pair_hole_scores')
), writes AS (
 SELECT p.relname, cmd, policyname, permissive, roles,
        coalesce(qual,'') AS using_predicate,
        coalesce(with_check,'') AS check_predicate
 FROM protected p JOIN pg_policies pol ON pol.schemaname='public' AND pol.tablename=p.relname
 WHERE cmd IN ('INSERT','UPDATE','DELETE','ALL')
), gate AS (
 SELECT p.relname,p.relrowsecurity,
  has_table_privilege('authenticated',p.oid,'INSERT') AS can_insert,
  has_table_privilege('authenticated',p.oid,'UPDATE') AS can_update,
  has_table_privilege('authenticated',p.oid,'DELETE') AS can_delete,
  count(w.policyname) FILTER (WHERE w.permissive='PERMISSIVE') AS permissive_write_policies,
  count(w.policyname) FILTER (WHERE w.permissive='RESTRICTIVE') AS restrictive_write_policies,
  count(w.policyname) FILTER (WHERE w.using_predicate LIKE '%elleng-cup%' OR w.check_predicate LIKE '%elleng-cup%') AS fixed_draft_policy_count
 FROM protected p LEFT JOIN writes w ON w.relname=p.relname
 GROUP BY p.relname,p.relrowsecurity,p.oid
)
SELECT *, CASE
 WHEN NOT relrowsecurity THEN 'NO-GO: RLS disabled'
 WHEN fixed_draft_policy_count>0 THEN 'NO-GO: hardcoded draft in write policy'
 WHEN (can_insert OR can_update OR can_delete) AND permissive_write_policies>0
 THEN 'REVIEW REQUIRED: direct authenticated DML may bypass RPC'
 ELSE 'REVIEW REQUIRED: verify RPC role and behavior'
 END AS readiness
FROM gate ORDER BY relname;
