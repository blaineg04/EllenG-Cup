# EllenG Cup — authenticated 18-hole scoring acceptance matrix

**Status:** Test plan only. No tests against a migrated Supabase backend have been executed.

**Preconditions:** isolated Supabase project/branch with the staged migration and `golfer-handicap` Edge Function; two distinct test golfers linked to a shared drafted team; another team; commissioner and captain test sessions; two authenticated devices. Do not use production tournament scores.

| Case | Action | Expected evidence |
| --- | --- | --- |
| Front-nine save | Golfer A saves 3 strokes on hole 1 (par 4) | One individual record, 4 points for A, no legacy lowest-ball team-score write |
| Front-nine second player | Golfer B saves 4 strokes on hole 1 | Team total is 7 points when its full roster is scored |
| Back-nine save | Both golfers score hole 10 | Individual scores persist and points count toward same 18-hole total |
| Gator multiplier | Commissioner designates hole 1 as Gator Hole | Each golfer's hole 1 earned points are doubled; team example 14 |
| All golfer contribution | One golfer records double bogey; another records eagle | Team earns 1 + 5 = 6 on that hole (without Gator) |
| Incomplete team | Golfer B has not submitted | Team hole is marked pending, not officially complete |
| Valid zero | Golfer A records triple bogey | Individual earns zero; score is recorded as valid and counts toward completion |
| Clear / edit | Golfer A corrects or clears a score | Points recalculate without stale duplicate or overwrite |
| Navigation race | Save hole 1, navigate to hole 2 before acknowledgement | Hole 1 updated, hole 2 untouched |
| Parallel devices | Two golfers save to the same team/hole simultaneously | Both independent scores retained, combined points correct |
| Unauthorized write | Golfer A attempts to change golfer B's score | Rejected; unchanged audit data |
| Unlinked login | Captain login with no golfer assignment attempts personal entry | Clear actionable error; no records written |
| Invalid inputs | Blank/negative/fractional/>20 strokes, hole 0 or 19 | Rejected with no writes |
| Cross-team leaderboard | Multiple teams have scores | Correct team totals and tie handling, independent of team count |
| Broadcast | Score recorded for a drafted golfer | Rostered golfer and hole shown; orphan records ignored |
| Spectator visibility | Signed-out or viewer session watches standings | Only approved public tournament fields exposed; no private account IDs/emails |
| Refresh & reconnection | Reload both devices and recover from connection loss | Same persisted result, no lost or double submission |

**Release evidence:** record backend ID (nonproduction only), database constraint, function version, Git SHA, each case PASS/FAIL, screenshots and sanitized query outputs. A green UI-only CI suite does not replace this acceptance matrix.
