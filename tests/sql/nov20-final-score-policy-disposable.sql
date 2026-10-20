-- Run ONLY in a disposable PostgreSQL/Supabase test database.
-- Assertions for finalized-score RLS behavior; never run against live tournament data.
-- Requires the policy migration to have been applied to that disposable database.
DO $$
DECLARE t text;
DECLARE n int;
DECLARE op text;
DECLARE policy_body text;
DECLARE is_rls_enabled boolean;
BEGIN
 FOR t IN SELECT unnest(ARRAY['elleng_team_scores','elleng_player_hole_scores','elleng_pair_hole_scores'])
 LOOP
   SELECT c.relrowsecurity INTO is_rls_enabled
   FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relname=t;
   IF is_rls_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION '% has RLS disabled',t; END IF;
   SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename=t
      AND permissive='PERMISSIVE' AND cmd IN ('SELECT','ALL')
      AND 'authenticated'=ANY(roles);
   IF n<1 THEN RAISE EXCEPTION '% has no authenticated SELECT policy',t; END IF;
   SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename=t
      AND permissive='RESTRICTIVE' AND cmd IN ('ALL','SELECT');
   IF n<>0 THEN RAISE EXCEPTION '% retains restrictive ALL policies (count=%)',t,n; END IF;
   FOREACH op IN ARRAY ARRAY['INSERT','UPDATE','DELETE']
   LOOP
     SELECT coalesce(with_check,qual) INTO policy_body
       FROM pg_policies
       WHERE schemaname='public' AND tablename=t
         AND permissive='RESTRICTIVE' AND cmd=op
         AND 'authenticated'=ANY(roles)
       LIMIT 1;
     IF policy_body IS NULL THEN RAISE EXCEPTION '% missing % restriction',t,op; END IF;
     IF policy_body NOT LIKE '%setup%' OR policy_body NOT LIKE '%live%'
     THEN RAISE EXCEPTION '% % policy missing live/setup condition',t,op; END IF;
   END LOOP;
 END LOOP;
END $$;

-- A completed behavioral test must additionally authenticate as a real,
-- disposable commissioner/captain/viewer and verify SELECT and write denial.
-- Never interpret the metadata assertions above as an authenticated RLS test.
