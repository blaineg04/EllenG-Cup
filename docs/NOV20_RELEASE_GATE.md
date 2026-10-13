# EllenG Cup — November 20, 2026 release gate

**Target event:** Friday, November 20, 2026. **Feature freeze target:** November 6. **Dress rehearsal target:** November 13.

## Source-of-truth audit (October 13)

- Compared `main` to `development/elleng-audit-20261013`: development is 36 commits ahead and 0 behind.
- This comparison is **not** evidence of passing tests or production readiness.
- Development-only additions include 2v2 planning, quota simulation/fairness, quota approval/lock helpers, and uneven-team planning. These modules are **not verified as integrated into the live commissioner and scoring flows**.
- Do not merge or deploy merely because the branch is ahead.
- All GitHub Actions must target the owner's **MacBook self-hosted runner**. Verify actual runner labels, availability, and execution logs before changing workflow routing or reporting CI success.
- Keep `main`, production, live Supabase, and FairwayOS untouched without explicit approval.

## P0 — must pass before November 20

| Gate | Acceptance check | Evidence needed | Status |
|---|---|---|---|
| Join and RSVP | A new golfer joins from a phone, RSVPs, and appears once | Two-device walkthrough | Unverified |
| Commissioner setup | Event date, course, holes, pars, format, and roster save/reload correctly | Saved setup walkthrough | Unverified |
| Teams and draft | Draft assigns every golfer once, honors A/B rules, and syncs across devices | Multi-device draft rehearsal | Unverified |
| Uneven roster | 19 and 22 golfer scenarios include everyone; commissioner approves fairness rule | Setup rehearsal | Logic only |
| Front 9 scramble | Captain saves and corrects each hole; team score updates | 9-hole test | Unverified |
| Back 9 shamble | Player scores yield the correct lowest counting score | 9-hole test | Unverified |
| Gator Hole | Double points and ties follow approved tournament rules | Scoring examples | Unverified |
| Final Cargo | Closing result and tie handling follow approved rules | Scoring examples | Unverified |
| Live leaderboard | Scores sync between captain, player and viewer without duplicates | Concurrent-device test | Unverified |
| Recovery | Refresh, lost connection and resumed scoring do not erase saved scores | Offline/reload test | Unverified |
| Access control | Players cannot alter team scores, commissioner settings, or others' data | Role test | Unverified |
| Mobile | No clipped controls; scoring usable on iPhone and Android | Device check | Unverified |
| CI | Relevant tests pass on MacBook self-hosted runner | GitHub job logs | Unverified |
| Rehearsal | Complete 18-hole mock event; commissioner signs off | Recorded sign-off | Unverified |

## Scope decision

Prioritize the established EllenG Cup front-nine scramble / back-nine shamble format and its existing scoring. Keep new quota calibration and alternate 2v2 formats behind development-only review until separately validated; do not let them block the event. Preserve all registered golfers even when the count is uneven, but require explicit commissioner approval of a format-specific balancing method.

## Milestones and escalation

- **October 23:** Join/RSVP, commissioner setup, and draft demonstrably work together.
- **October 30:** Full 18-hole scoring and leaderboard demonstrate correct results across devices.
- **November 6:** Freeze nonessential features. Fix only event-blocking bugs.
- **November 13:** Full multi-device dress rehearsal, including uneven teams and reconnection.
- **November 19:** Final sign-off; verify event details, roster, backups, and recovery procedure.
- **November 20:** Tournament day.

If a P0 gate remains unverified at a milestone, prioritize it over new features. Do not mark a gate complete based solely on committed code.
