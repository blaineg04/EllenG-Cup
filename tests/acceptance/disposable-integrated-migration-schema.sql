-- Disposable PostgreSQL ONLY: minimal production-shaped objects for parsing
-- the integrated migration candidate. No real tournament records.
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE TABLE public.elleng_drafts(id text PRIMARY KEY, owner_id uuid, state jsonb);
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY,draft_id text,status text,team_count integer);
CREATE TABLE public.elleng_captains(draft_id text,user_id uuid,team_index integer);
CREATE TABLE public.elleng_team_scores(tournament_id text,team_index integer,hole integer,score integer,updated_by uuid,updated_at timestamptz,CONSTRAINT elleng_team_scores_score_check CHECK(score BETWEEN 1 AND 20),UNIQUE(tournament_id,team_index,hole));
CREATE TABLE public.elleng_pair_hole_scores(tournament_id text,team_index integer,hole integer,pair_index integer,score integer,updated_by uuid,updated_at timestamptz,UNIQUE(tournament_id,team_index,hole,pair_index));
CREATE TABLE public.elleng_player_hole_scores(tournament_id text,team_index integer,hole integer,golfer_index integer,score integer,updated_by uuid,updated_at timestamptz,UNIQUE(tournament_id,hole,team_index,golfer_index));
