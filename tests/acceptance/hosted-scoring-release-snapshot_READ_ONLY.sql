-- READ ONLY. Capture the actual hosted database contract before approval.
-- Run and retain result with the deployment review; NEVER modify live state.
SELECT 'table' AS kind,c.relname AS object_name,
 jsonb_build_object('rls_enabled',c.relrowsecurity,
  'authenticated_insert',has_table_privilege('authenticated',c.oid,'INSERT'),
  'authenticated_update',has_table_privilege('authenticated',c.oid,'UPDATE'),
  'authenticated_delete',has_table_privilege('authenticated',c.oid,'DELETE'),
  'anon_insert',has_table_privilege('anon',c.oid,'INSERT'),
  'custom_triggers',(SELECT coalesce(jsonb_agg(pg_get_triggerdef(t.oid)), '[]'::jsonb)
    FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)) AS detail
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('elleng_team_scores','elleng_pair_hole_scores','elleng_player_hole_scores')
UNION ALL
SELECT 'rpc',p.proname,jsonb_build_object('signature',pg_get_function_identity_arguments(p.oid),
 'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,
 'search_path',p.proconfig,
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
 'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('elleng_test_authorized_scramble','elleng_test_authorized_shamble',
 'elleng_test_authorized_split_pair','elleng_test_commissioner_clear_scores')
ORDER BY kind,object_name;
