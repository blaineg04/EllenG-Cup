-- A dedicated negative test: invoke the actual migration when RLS is off.
-- psql must report a failure and publication membership must remain unchanged.
ALTER TABLE public.elleng_pair_hole_scores DISABLE ROW LEVEL SECURITY;
\i docs/proposed-realtime-publication-migration.sql
