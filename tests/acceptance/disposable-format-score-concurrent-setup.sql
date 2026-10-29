-- Disposable PostgreSQL only: setup for two-session score-versus-format races.
CREATE TABLE public.elleng_drafts(id text PRIMARY KEY,state jsonb NOT NULL);
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY,draft_id text NOT NULL);
CREATE TABLE public.elleng_team_scores(tournament_id text,team_index integer,hole integer,score integer,
 CONSTRAINT score_range CHECK(score BETWEEN 1 AND 40));
CREATE TABLE public.elleng_pair_hole_scores(tournament_id text);
CREATE TABLE public.elleng_player_hole_scores(tournament_id text);
INSERT INTO public.elleng_drafts VALUES ('draft','{"playFormat":"standard"}');
INSERT INTO public.elleng_tournaments VALUES ('event','draft');
\i db/patches/20261028_team_score_format_trigger_REVIEW_ONLY.sql
CREATE TRIGGER enforce_team_score_format BEFORE INSERT OR UPDATE ON public.elleng_team_scores
 FOR EACH ROW EXECUTE FUNCTION public.elleng_enforce_team_score_format();
CREATE TRIGGER guard_scored_draft_format BEFORE UPDATE OF state ON public.elleng_drafts
 FOR EACH ROW EXECUTE FUNCTION public.elleng_prevent_scored_draft_format_change();
