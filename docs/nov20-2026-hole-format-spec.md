# EllenG Cup — November 20, 2026 hole-format specification

Status: commissioner-confirmed playing rules; implementation and verification pending.

## Playing formats

- Par 3: Every golfer plays their own ball from tee through hole-out. No shared shot.
- Par 4: All golfers tee off; team selects the best drive. Each golfer plays their own ball from that selected location starting with stroke two, and holes out individually.
- Par 5: All golfers tee off; team selects the best drive. All golfers hit their second shot from the selected drive location; team selects the best second shot. Each golfer then plays their own ball from the selected second-shot location starting with stroke three, and holes out individually.

Every golfer records their own actual stroke count for the hole, including the shared first one or two shots. No handicap adjustment to stroke-based points. Every golfer's points count toward their team's total.

## Points

Eagle or better = 5; birdie = 4; par = 3; bogey = 2; double bogey = 1; triple bogey or worse = 0. Missing score is not a zero-point completed score. Gator Hole winner gets 10 bonus points; a tie awards 5 to each team. Final Cargo Shot is not used.

## Required UI updates

Update Tournament Rules, score-entry introductory copy, Scoring Rules helper, and any shamble-format explanations in Clubhouse/Broadcast/Extras to accurately describe the par-dependent rules. Do not change scoring points or draft/team data.

## Acceptance tests before merge

1. Par 3: no shared shots, own ball throughout.
2. Par 4: one selected drive; individual strokes two onward.
3. Par 5: selected first and second shots; individual strokes three onward.
4. Stroke-to-point conversions correct for every par and triple-or-worse zero.
5. All players' scores contribute, including unequal team sizes.
6. Gator Hole bonus exactly 10/5+5; no Final Cargo bonus.
7. Existing score entry, draft, captain permissions, and mobile navigation remain intact.
8. Verify all user-visible copy and rules are consistent before production deployment.
