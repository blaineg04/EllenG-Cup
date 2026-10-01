EllenG Cup safe fixes

scoring.html
- Keeps v2.7.6 visible/meta version.
- Keeps iPhone tee-sheet width fix.
- Uses parForHole() for Hole Matchup / scoring displays.
- Uses black iPhone status-bar style instead of black-translucent.

draft.html
- Public roster cards now use the same teamCapacity(i) calculation as Captain Draft, preventing false extra open roster spots when golfer counts are uneven.
- Existing connection-status fix remains intact.

captain.html
- Removed two stray CSS closing braces near the top of the file.
- No captain authentication, pick logic, band rules, Supabase calls, or banner/menu behavior changed.

common.js was intentionally NOT included because the current live common.js already contains bandRange(), teamCapacity(), canBand(), load/save/subscribe, and other required helpers.
