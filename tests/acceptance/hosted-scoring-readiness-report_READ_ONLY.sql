-- Read-only EllenG scoring GO/NO-GO report.
-- Safe on existing production: SELECT statements only, no migrations or writes.
WITH rpc AS (
 SELECT count(*) FILTER (WHERE to_regprocedure(signature) IS NOT NULL) AS installed_count
 FROM (VALUES
  ('public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer)'),
  ('public.elleng_test_authorized_shamble(text,integer,integer,integer,integer)')
 ) x(signature)
), scoring_tables AS (
 SELECT count(*) AS protected_count
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN
 ('elleng_team_scores','elleng_pair_hole_scores','elleng_player_hole_scores')
 AND c.relrowsecurity
), score_limit AS (
 SELECT pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k
 JOIN pg_class c ON c.oid=k.conrelid
 WHERE c.relname='elleng_team_scores' AND k.conname='elleng_team_scores_score_check'
)
SELECT
 (SELECT installed_count FROM rpc)=2 AS both_rpc_installed,
 (SELECT protected_count FROM scoring_tables)=3 AS all_score_tables_rls_enabled,
 coalesce((SELECT definition FROM score_limit),'MISSING CONSTRAINT') AS team_score_constraint,
 CASE
  WHEN (SELECT installed_count FROM rpc)<>2 THEN 'NO-GO: scoring RPC missing'
  WHEN (SELECT protected_count FROM scoring_tables)<>3 THEN 'NO-GO: score RLS missing'
  ELSE 'REVIEW REQUIRED: auth, range, bypass, multi-device and rollback still unverified'
 END AS readiness;
