# My Score action accessibility — October 29, 2026
The player reported that My Score could not scroll and the Save/Clear buttons were clipped beneath the visible card after a status message.
Old fixed flex-basis/max-height rules capped the card near 190–204px. Removing height alone did not remove those constraints.
Fix: override flex-basis and max-height with a more specific selector, let content determine card height, enable vertical overflow for the active My Score view, and provide scroll padding/margins around fixed navigation.
Same correction applied to scoring.html and player-scoring-test.html; no backend, permissions or score records changed.
Verification:
- 473 root regression tests passed on the Mac runner.
- Real application navigation with a synthetic SDK fixture confirmed both buttons are hit-testable and unclipped, and that My Score scrolls when needed.
- Both pages checked at 320x568,375x667,390x740,1440x900 with a long saved-score message.
- Baseline browser assertion reproduced the fixed maximum (204px instead of none).
- Existing delayed Home-landing callbacks caused a fixture navigation race; the test now observes their completion before navigating to My Score. This does not claim that landing behavior was changed.
- Independent review approved the CSS correction.
Passing run: https://github.com/blaineg04/EllenG-Cup/actions/runs/40986588672
Tested commit: fefe45e9042c89e3240227d6a5e6c1ce41abe5a7.
Separate read-only hosted observation confirmed the user's player clear removed Pair 1 and its derived total while retaining seeded Pair 2=19 in the synthetic player Split-Pair event.
