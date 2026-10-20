-- Run ONLY in a disposable PostgreSQL/Supabase test database.
-- Assertions for finalized-score RLS behavior; never run against live tournament data.
-- Requires the policy migration to have been applied to that disposable database.
DO $$
DECLARE t text;
DECLARE n int;
BEGIN
 FOR t IN SELECT unnest(ARRAY['elleng_team_scores','elleng_player_hole_scores','elleng_pair_hole_scores'])
 LOOP
   SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename=t
      AND permissive='RESTRICTIVE' AND cmd='ALL';
   IF n<>0 THEN RAISE EXCEPTION '% retains restrictive ALL policies (count=%)',t,n; END IF;
   SELECT count(*) INTO n FROM pg_policies
    WHERE schemaname='public' AND tablename=t
      AND permissive='RESTRICTIVE' AND cmd IN ('INSERT','UPDATE','DELETE');
   IF n<3 THEN RAISE EXCEPTION '% missing write guards (count=%)',t,n; END IF;
 END LOOP;
END $$;

-- A completed behavioral test must additionally authenticate as a real,
-- disposable commissioner/captain/viewer and verify SELECT and write denial.
-- Never interpret the metadata assertions above as an authenticated RLS test.
