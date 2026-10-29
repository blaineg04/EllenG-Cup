-- Disposable-only test of ACTUAL staged format trigger definition.
BEGIN;
CREATE TABLE public.elleng_drafts(id text PRIMARY KEY,state jsonb NOT NULL);
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY,draft_id text NOT NULL);
CREATE TABLE public.elleng_team_scores(tournament_id text,team_index integer,hole integer,score integer,
 CONSTRAINT elleng_team_scores_score_check CHECK(score BETWEEN 1 AND 40));
INSERT INTO public.elleng_drafts VALUES ('d-standard','{"playFormat":"elleng"}'),('d-split','{"playFormat":"split_pair"}');
INSERT INTO public.elleng_tournaments VALUES ('standard','d-standard'),('split','d-split');
\i db/patches/20261028_team_score_format_trigger_REVIEW_ONLY.sql
CREATE TRIGGER elleng_enforce_team_score_format BEFORE INSERT OR UPDATE ON public.elleng_team_scores
FOR EACH ROW EXECUTE FUNCTION public.elleng_enforce_team_score_format();
INSERT INTO public.elleng_team_scores VALUES('standard',0,1,20),('split',0,1,40);
DO $test$ DECLARE rejected boolean; BEGIN
 rejected:=false;
 BEGIN INSERT INTO public.elleng_team_scores VALUES('standard',0,2,40);
 EXCEPTION WHEN check_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Standard score 40 unexpectedly accepted'; END IF;
 rejected:=false;
 BEGIN INSERT INTO public.elleng_team_scores VALUES('split',0,2,1);
 EXCEPTION WHEN check_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Split-Pair score 1 unexpectedly accepted'; END IF;
 rejected:=false;
 BEGIN UPDATE public.elleng_team_scores SET tournament_id='standard' WHERE tournament_id='split';
 EXCEPTION WHEN check_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Reassignment to standard escaped range guard'; END IF;
END $test$;
ROLLBACK;
