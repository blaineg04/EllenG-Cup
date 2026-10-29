-- REVIEW ONLY. Audit privileged RPC owners and role exposure after installing
-- the coordinated migration inside disposable PostgreSQL. Fail closed.
DO $rpc_owners$
DECLARE bad text;
BEGIN
 SELECT string_agg(p.proname||' owner='||r.rolname||' definer='||p.prosecdef||' config='||coalesce(array_to_string(p.proconfig,','),'null')||' anon_exec='||has_function_privilege('anon',p.oid,'EXECUTE')||' auth_exec='||has_function_privilege('authenticated',p.oid,'EXECUTE'), ', ')
 INTO bad
 FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_roles r ON r.oid=p.proowner
 WHERE n.nspname='public'
 AND p.proname IN (
  'elleng_test_authorized_scramble','elleng_test_authorized_shamble',
  'elleng_test_authorized_split_pair','elleng_test_commissioner_clear_scores'
 )
 AND (
  NOT p.prosecdef OR p.proconfig IS NULL
  OR NOT (p.proconfig && ARRAY['search_path=','search_path=""']::text[])
  OR r.rolname IN ('anon','authenticated')
  OR has_function_privilege('anon',p.oid,'EXECUTE')
  OR NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 );
 IF bad IS NOT NULL THEN
  RAISE EXCEPTION 'NO-GO: privileged scoring RPC owner/search_path/ACL mismatch: %',bad;
 END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
   'elleng_test_authorized_scramble','elleng_test_authorized_shamble',
   'elleng_test_authorized_split_pair','elleng_test_commissioner_clear_scores')) <> 4
 THEN RAISE EXCEPTION 'NO-GO: four privileged scoring RPCs are required'; END IF;
END $rpc_owners$;
