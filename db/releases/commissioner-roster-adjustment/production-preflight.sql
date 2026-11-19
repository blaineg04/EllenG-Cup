-- EllenG Cup Nov 20: read-only production preflight for commissioner roster adjustment.
-- This script NEVER updates tournament data. Target only project xepccqedhbucpbwuykoc.
-- A separate commissioner-authenticated RPC must perform any future writes.
WITH d AS (
 SELECT id, updated_at, state FROM public.elleng_drafts WHERE id='elleng-cup'
), targets(golfer_index, golfer_name, desired_team) AS (
 VALUES (56,'Connor Castille',0),(15,'Michael Glover',1),
        (7,'Donny Wyble',0),(20,'Patrick Carlton',0)
)
SELECT t.golfer_index, t.golfer_name,
       d.state#>>ARRAY['golfers',t.golfer_index::text,'name'] AS actual_name,
       d.state#>>ARRAY['golfers',t.golfer_index::text,'team'] AS current_team,
       t.desired_team,
       d.state#>>ARRAY['golfers',t.golfer_index::text,'participating'] AS participating,
       (SELECT count(*) FROM jsonb_array_elements(d.state->'teams') team,
           jsonb_array_elements_text(team->'roster') ri
        WHERE ri=t.golfer_index::text) AS roster_occurrences,
       (SELECT count(*) FROM public.elleng_player_hole_scores
        WHERE tournament_id='elleng-cup-live') AS player_scores,
       (SELECT count(*) FROM public.elleng_team_scores
        WHERE tournament_id='elleng-cup-live') AS team_scores,
       (SELECT count(*) FROM public.elleng_pair_hole_scores
        WHERE tournament_id='elleng-cup-live') AS pair_scores,
       (SELECT count(*) FROM public.elleng_group_assignments
        WHERE draft_id='elleng-cup') AS existing_groups,
       d.updated_at AS expected_version
FROM d CROSS JOIN targets t
ORDER BY t.golfer_index;

-- Release requirements:
-- * authenticated commissioner identity equals elleng_drafts.owner_id
-- * tournament remains setup, no scores, no conflicting group assignments
-- * exact golfer names/indices and expected_updated_at match under row lock
-- * atomic update to golfer.team, participating, team rosters and picks
-- * no duplicate roster entries, no changes to other golfers/captains
-- * do not disable elleng_guard_weighted_roster or bypass its checks
-- * restore original state on any validation error; test in disposable DB first
