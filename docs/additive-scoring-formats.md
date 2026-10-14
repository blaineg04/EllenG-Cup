# EllenG Cup — additive scoring formats (development specification)

## Non-destructive requirement
All currently implemented scoring formats, scoring data, draft controls, Gator Hole, and Final Cargo must remain available. Do not replace existing format identifiers, defaults, historical score records, or production configuration. Introduce a separate format identifier `two_team_individual_points`. Any deployment or schema migration requires separate approval.

## New format: Two-Team Individual Points
- Exactly two teams, with flexible roster sizes and no hard-coded maximum of 30.
- All golfers enter their own gross strokes for each hole (par 3/4/5). No handicap adjustments and no quotas for this format.
- Award per-player points: hole-in-one 7, eagle 6, birdie 5, par 4, bogey 2, double bogey or worse 1. Eagle is based on relative score; hole-in-one overrides relative score. Scores better than eagle (e.g. albatross) require an explicit policy before implementation, not an implicit zero.
- Team points are the sum of **both/all** assigned golfers' points across completed holes, not best-ball or winning-hole-only points.
- Double bogey or worse is worth 1 point; players may pick up at double bogey. Record a pickup as a separate scoring state rather than fabricating a gross stroke count.
- For official competition, equal roster sizes should be required before start; allow uneven or odd RSVPs during setup. If unequal rosters are permitted in a future rule, explicitly disclose the scoring advantage.
- Do not award points for holes not yet played or for missing scores. Track per-player completed holes and team participation in live standings.
- A player's team assignment and score must be auditable; team changes during live play must not silently duplicate or discard earned points.

## Format selection
Keep every existing format selectable with its own rules and legacy storage. Only the new points format ignores handicaps and quotas. Do not apply this format's scoring table to scramble, shamble, or other formats. Existing extras remain available where compatible; their interaction with the new points format requires explicit definition before enabling.

## Development acceptance criteria
1. Existing format choices and their historical rounds continue to render unchanged.
2. New format handles 8, 30, and >30 golfers without a fixed cap.
3. Two teams sum every golfer's points correctly over 18 holes.
4. Missing holes earn no points; double-bogey pickup earns one point without false strokes.
5. Hole-in-one on par 3 overrides eagle; no duplicate credit.
6. Switching formats during a live event cannot reinterpret previously stored scores.
7. Scoring is consistent across player entry, captain view, commissioner view, and live leaderboard.
8. Implement and test on development branch; no production or live database changes without approval.
