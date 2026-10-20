-- Disposable LOCAL PostgreSQL ONLY. Run against a fresh elleng_policy_test_* database.
-- Minimal fixture for end-to-end finalized-score RLS; no production data.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
   CREATE ROLE authenticated NOLOGIN;
 END IF;
END $$;
CREATE TABLE public.elleng_tournaments (
 id uuid PRIMARY KEY, status text NOT NULL, team_count integer NOT NULL
);
CREATE TABLE public.elleng_team_scores (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tournament_id uuid NOT NULL, team_index integer NOT NULL
);
CREATE TABLE public.elleng_player_hole_scores (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tournament_id uuid NOT NULL, team_index integer NOT NULL
);
CREATE TABLE public.elleng_pair_hole_scores (
 id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tournament_id uuid NOT NULL, team_index integer NOT NULL
);
INSERT INTO public.elleng_tournaments VALUES ('00000000-0000-0000-0000-000000000091','final',2);
DO $$
DECLARE t text;
DECLARE old_name text;
BEGIN
 FOR t,old_name IN
  SELECT * FROM (VALUES
    ('elleng_team_scores','active live team guard team scores'),
    ('elleng_player_hole_scores','active live team guard player scores'),
    ('elleng_pair_hole_scores','active live team guard pair scores')
  ) AS v(t,old_name)
 LOOP
  EXECUTE format('INSERT INTO public.%I(tournament_id,team_index) VALUES (%L,0)',
     t,'00000000-0000-0000-0000-000000000091');
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('GRANT USAGE,SELECT ON SEQUENCE public.%I_id_seq TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true)',
    'fixture permissive access',t);
  EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.elleng_tournaments x WHERE x.id=tournament_id AND x.status IN (''setup'',''live''))) WITH CHECK (EXISTS (SELECT 1 FROM public.elleng_tournaments x WHERE x.id=tournament_id AND x.status IN (''setup'',''live'')))',
    old_name,t);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.elleng_tournaments TO authenticated;
