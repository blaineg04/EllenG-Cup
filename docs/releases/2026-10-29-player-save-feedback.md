# Player save feedback and reload fix — October 29, 2026
The bburt user saved 4 strokes on Hole 1 in elleng-player-standard-test-20261029. A read-only database query confirmed golfer index 0 score 4 at 2026-10-30T01:14:51.944331Z.
The refreshed UI showed an empty field: no saved-score hydration existed, and two compact-layout CSS rules explicitly hid selfScoreMsg.
Fix: restore the current player's personal or assigned-pair score from loaded rows, keyed by session/event/golfer/hole. Preserve unsaved edits during same-context refresh; switching holes loads that hole's saved value.
Remove the hiding rules, move the status above the buttons, add role=status / aria-live=polite, and allow the score card to accommodate visible confirmation.
Applied to scoring.html and the isolated player-scoring-test.html. No database writes or backend behavior changes.
Verification: 473 root regression tests passed locally and on the Mac runner; six new hydration/status cases passed. Independent review found no Critical/Important issues.
Native Chromium checked visible status within the score card at widths 375,390,1440:
https://github.com/blaineg04/EllenG-Cup/actions/runs/40985289692
The first visual fixture left an app ancestor hidden because page scripts were intentionally removed. The fixture was corrected to show active ancestors; the second run passed. This is isolated layout evidence, not a new authenticated browser test.
The original user save is confirmed at database level. User refresh confirmation after deployment remains pending.
