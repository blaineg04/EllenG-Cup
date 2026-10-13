# EllenG Cup — optional two-team 2v2 format

## Requested format
Support a tournament with exactly **two teams**, **two captains** (one per team), and multiple head-to-head 2-player pairings. Do not remove the existing multi-team scramble/shamble tournament format.

## Configuration
- Commissioner selects team count (2 or the existing supported counts), player count, and match format.
- Two-team mode must not assume six or seven captains or a fixed 24-player roster.
- For 2v2 matches, every match consists of exactly two golfers from Team A versus two golfers from Team B.
- For complete simultaneous pairings, each team needs an even, equal number of participating golfers; otherwise present an explicit unpaired-player/rotation decision.
- Captains may play if included in the player roster. Do not count captains as extra players by default.

## Match scoring decisions still required
- Decide whether each 2v2 pairing plays scramble, shamble, best ball, or another scoring method.
- Decide match-play points versus aggregate strokes and whether Gator Hole / Final Cargo apply per match or per team.
- Define tie handling, substitutes, and rotations before implementing standings.

## Regression cases
- 2 teams / 4 golfers (one match)
- 2 teams / 8 golfers (two matches)
- 2 teams / 12 golfers (three matches)
- 2 teams / 16 golfers (four matches)
- Odd or unequal team rosters: show a clear configuration warning
- Existing 6-team and 7-team tournaments remain functional

## Safety
Implement only on EllenG development branches, test with fixtures, and preserve live tournament state.
