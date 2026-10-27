-- EllenG Cup 18-hole individual shamble scoring.
-- Staged only: apply during the coordinated release after backup and validation.
-- Existing data are preserved. This widens the supported hole range from 10–18 to 1–18.
BEGIN;
ALTER TABLE public.elleng_player_hole_scores
  DROP CONSTRAINT IF EXISTS elleng_player_hole_scores_hole_check;
ALTER TABLE public.elleng_player_hole_scores
  ADD CONSTRAINT elleng_player_hole_scores_hole_check
  CHECK (hole BETWEEN 1 AND 18);
COMMIT;
