-- READ ONLY. Never run as a migration. Safe to execute in the production SQL editor.
-- Intended to inspect transfer-RPC prerequisites without exposing golfer records.
SELECT
  c.relname AS table_name,
  a.attname AS column_name,
  format_type(a.atttypid,a.atttypmod) AS column_type
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
WHERE n.nspname='public' AND c.relname IN
 ('elleng_drafts','elleng_tournaments','elleng_player_hole_scores','elleng_team_scores','elleng_pair_hole_scores')
ORDER BY c.relname,a.attnum;

SELECT t.tgname AS trigger_name,c.relname AS table_name,
       pg_get_triggerdef(t.oid) AS trigger_definition,
       p.proname AS trigger_function
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid
WHERE n.nspname='public' AND c.relname IN ('elleng_drafts','elleng_tournaments')
AND NOT t.tgisinternal
ORDER BY c.relname,t.tgname;

SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,pg_get_userbyid(p.proowner) AS function_owner
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('elleng_guard_weighted_roster','elleng_withdraw_golfer','elleng_set_player_participation','elleng_test_authorized_shamble')
ORDER BY p.proname;

SELECT c.relname AS table_name, grantee,privilege_type
FROM information_schema.role_table_grants g
JOIN pg_class c ON c.relname=g.table_name
WHERE g.table_schema='public'
AND g.table_name IN ('elleng_drafts','elleng_tournaments')
AND grantee IN ('authenticated','anon')
ORDER BY c.relname,grantee,privilege_type;
