-- READ-ONLY preflight for post-draft transfer RPC design.
-- Run manually with a read-only role against the intended environment.
-- No writes, no function execution, no roster modifications.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('elleng_guard_weighted_roster','elleng_test_authorized_shamble',
  'elleng_weighted_pick','elleng_set_player_participation')
ORDER BY p.proname;

SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
 ('elleng_drafts','elleng_tournaments','elleng_player_hole_scores',
  'elleng_team_scores','elleng_pair_hole_scores') AND NOT t.tgisinternal
ORDER BY c.relname,t.tgname;

SELECT table_name,column_name,data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN
 ('elleng_drafts','elleng_tournaments','elleng_player_accounts',
  'elleng_player_hole_scores','elleng_team_scores','elleng_pair_hole_scores')
ORDER BY table_name,ordinal_position;

SELECT tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN
 ('elleng_drafts','elleng_tournaments','elleng_player_accounts',
  'elleng_player_hole_scores','elleng_team_scores','elleng_pair_hole_scores')
ORDER BY tablename,policyname;
