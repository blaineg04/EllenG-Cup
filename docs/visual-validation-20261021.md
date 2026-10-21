# EllenG Cup responsive validation — October 21, 2026

Branch: `release/nov20-score-integrity-20261020`. Production was not modified.

## Verified locally

- Exact viewport widths: **320, 375, 390, 430, 1024, 1440, 1920** CSS pixels.
- Heights: 812 mobile; 1080 desktop. Chromium 143.0.7499.0, with Playwright 1.62.1.
- **148 page/state captures**, each with viewport and full-page screenshots; extra scroll captures where applicable.
- **0 detected document overflows, out-of-bounds controls, unintentional control overlaps or horizontally clipped labels; 0 startup/navigation errors.**
- Contact sheets reviewed for all seven widths. Synthetic nine-team/36-golfer data includes long names, scores, a partial draft with available golfers, and player/commissioner views.
- **32 Node regression and safety tests passed.**

Pages/states include signed-in menu, commissioner and player Home, player My Score, leaderboard, teams, players, course, hole progress, clubhouse, Trash Talk, commissioner score entry/dashboard, rankings, Extras with internal scroll positions, Broadcast, public draft, captain draft, legacy commissioner draft setup, and sign-in.

## Confirmed fixes

- Restore the missing points formatter that stopped populated tournament pages from loading.
- Fit the complete destination menu on the tested narrow mobile screens and remove duplicate arrow graphics.
- Allow mobile Extras content cards to retain their natural heights and wrap long matchup/team names.
- Contain the legacy commissioner setup header/table/inputs at narrow widths.
- Preserve the previously committed wrapping of the desktop navigation row.

## Automation and limits

The self-hosted macOS workflow installs pinned Playwright and its Chromium, runs scoring/safety tests, captures the matrix, and retains synthetic artifacts for one day. The original local isolated run is recorded above; the MacBook CI confirmation is recorded below.

Fixture mode uses the real checked-out HTML/JS with a test-only SDK replacement. It blocks external network access. It does not validate live database permissions, data synchronization, or authenticated preview integration. Live preview mode is separate, rejects production/unverified origins, uses an ignored local session file, and blocks tournament mutations during both session acquisition and test execution. No live session was available to the local Playwright process during this run.

Layout state capture sometimes invokes existing navigation click handlers programmatically; it is not a complete navigation-reachability audit. Intentional ellipsis and horizontally scrollable course tables remain. These captures do not prove every possible roster, viewport height, text size or browser is correct.

## MacBook CI confirmation

- Run: https://github.com/blaineg04/EllenG-Cup/actions/runs/39647666825
- Tested commit: `169728deff5132861b1c25a3f7a4aebd57a1be69`.
- Runner: `EllenG-Macbook`; Playwright Chromium 151.0.7922.34.
- Both `responsive-layout` and `scoring-regression` completed successfully.
- 32 regression/safety tests passed; 148 page/state captures across all seven widths; zero flagged layout candidates and zero startup/navigation errors.
- Downloaded the CI artifact and reviewed viewport contact sheets at every width. No additional overlap or horizontal-overflow issue was confirmed. Scrollable views and intentional text ellipsis remain; this does not certify a no-scroll interface or every button's reachability.
- Screenshots and report were uploaded as the synthetic artifact `elleng-responsive-169728deff5132861b1c25a3f7a4aebd57a1be69` (one-day retention).
- This is isolated fixture validation, not authenticated live preview validation. No production deployment or live tournament mutation was performed.
