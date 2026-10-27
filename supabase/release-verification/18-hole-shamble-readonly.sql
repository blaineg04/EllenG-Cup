-- EllenG Cup: READ-ONLY release verification for 18-hole individual shamble.
-- Run before and after the coordinated migration. No tournament data is altered.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.elleng_player_hole_scores'::regclass
  AND conname IN ('elleng_player_hole_scores_hole_check',
                  'elleng_player_hole_scores_score_check')
ORDER BY conname;
SELECT
 count(*) AS individual_score_rows,
 count(*) FILTER (WHERE hole BETWEEN 1 AND 9) AS front_nine_rows,
 count(*) FILTER (WHERE hole BETWEEN 10 AND 18) AS back_nine_rows,
 count(*) FILTER (WHERE hole NOT BETWEEN 1 AND 18) AS invalid_holes
FROM public.elleng_player_hole_scores;
SELECT count(*) AS duplicate_golfer_hole_rows FROM (
 SELECT tournament_id,hole,team_index,golfer_index
 FROM public.elleng_player_hole_scores
 GROUP BY tournament_id,hole,team_index,golfer_index
 HAVING count(*) > 1
) duplicates;
-- Expected after migration: check permits holes 1 through 18; invalid_holes=0;
-- duplicate_golfer_hole_rows=0. Actual authenticated score writes still require
-- controlled testing; these checks do not assert a deployment succeeded.
