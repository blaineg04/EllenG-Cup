-- REVIEW ONLY — do NOT apply independently or to live production.
-- Confirmed existing constraint: elleng_team_scores_score_check CHECK(score >= 1 AND score <= 20).
-- Split-Pair combines two independently valid pair scores (each 1..20), so total 2..40.
-- Only deploy together with a server-authorized, atomic, format-aware Split-Pair RPC.
-- In particular: standard (non-Split-Pair) team scores must still be limited to 20
-- by trusted server-side validation; widening this CHECK alone is insufficient.
BEGIN;
ALTER TABLE public.elleng_team_scores
  DROP CONSTRAINT elleng_team_scores_score_check;
ALTER TABLE public.elleng_team_scores
  ADD CONSTRAINT elleng_team_scores_score_check
  CHECK (score IS NULL OR (score >= 1 AND score <= 40));
COMMIT;
