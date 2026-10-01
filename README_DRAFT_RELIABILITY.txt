EllenG Cup — Draft Reliability Fix

Files to replace in the root of the EllenG-Cup GitHub repository:
- common.js
- draft.html
- captain.html

What changed:
1) Team roster capacity now follows the ACTUAL snake-draft pick order for any uneven golfer/team count.
   Example: 27 golfers / 7 teams => 3,4,4,4,4,4,4 picks by actual snake order.
2) A/B/C/D balance remains enforced normally.
3) If an uneven rank mix would otherwise leave the team on the clock with zero legal golfers,
   only the lowest-balance-penalty remaining rank(s) become eligible so the draft can continue.
4) Captain client eligibility now mirrors the Supabase server-side rule.

Supabase server-side draft function was updated directly and verified without making any live picks.
No tournament picks, scores, handicaps, or player records were changed.
