-- READ-ONLY security release gate. Never modifies any Supabase environment.
-- Designed for an authorized isolated database or explicit read-only audit.
-- PostgreSQL permissive policies are OR-combined. A broad write policy
-- may bypass otherwise strict captain/commissioner policies.
WITH write_policies AS (
 SELECT tablename, policyname, permissive, cmd, qual, with_check
 FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('elleng_player_hole_scores','elleng_team_scores','elleng_pair_hole_scores')
   AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
),
broad AS (
 SELECT *
 FROM write_policies
 WHERE policyname LIKE 'active live % guard'
)
SELECT tablename,policyname,permissive,cmd,
       CASE WHEN permissive = 'RESTRICTIVE'
            THEN 'REVIEW: restrictive guard; check companion ownership policies'
            WHEN coalesce(qual,'') LIKE '%auth.uid(%'
              OR coalesce(with_check,'') LIKE '%auth.uid(%'
            THEN 'REVIEW: identity condition present; verify effective authorization'
            ELSE 'BLOCK: permissive write guard lacks caller identity check' END AS security_gate
FROM broad ORDER BY tablename,policyname;

-- Fail a CI release gate if any broad active-live write policy remains permissive
-- and has no caller identity predicate. This statement never writes data.
DO $audit$
DECLARE offending_count integer;
BEGIN
  SELECT count(*) INTO offending_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('elleng_player_hole_scores','elleng_team_scores','elleng_pair_hole_scores')
    AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
    AND policyname LIKE 'active live % guard'
    AND permissive = 'PERMISSIVE'
    AND coalesce(qual,'') NOT LIKE '%auth.uid(%'
    AND coalesce(with_check,'') NOT LIKE '%auth.uid(%';
  IF offending_count > 0 THEN
    RAISE EXCEPTION 'Scoring RLS release gate failed: % broad permissive write policies', offending_count;
  END IF;
END
$audit$;
