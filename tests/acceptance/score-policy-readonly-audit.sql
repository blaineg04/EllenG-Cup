-- READ-ONLY security release gate. Never modifies any Supabase environment.
-- Designed for an authorized isolated database or explicit read-only audit.
-- PostgreSQL permissive policies are OR-combined. A broad write policy
-- may bypass otherwise strict captain/commissioner policies.
WITH write_policies AS (
 SELECT tablename, policyname, cmd, qual, with_check
 FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('elleng_player_hole_scores','elleng_team_scores')
   AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
),
broad AS (
 SELECT *
 FROM write_policies
 WHERE policyname LIKE 'active live % guard'
)
SELECT tablename,policyname,cmd,
       CASE WHEN coalesce(qual,'') LIKE '%auth.uid(%'
                 OR coalesce(with_check,'') LIKE '%auth.uid(%'
            THEN 'REVIEW' ELSE 'BLOCK: lacks caller identity check' END AS security_gate
FROM broad ORDER BY tablename,policyname;
