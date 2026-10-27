# Responsive checks

This is a layout check, not proof of scoring correctness or authenticated live integration. All seven widths are exact CSS pixels: 320, 375, 390, 430, 1024, 1440, 1920. Mobile height is 812; desktop height is 1080. Screenshots include both the viewport and the complete page. `report.json` records potential clipping, control overlaps and horizontal overflow. Page state navigation uses existing click handlers; ordinary tab reachability is not fully validated by these layout captures. Inspect screenshots before changing CSS: decorative overlaps and intentional scroll regions may need human review.

## Isolated run (default, CI safe)

```
npm ci --prefix tests/visual --ignore-scripts --no-audit --no-fund
tests/visual/node_modules/.bin/playwright install chromium
node tests/visual/run.cjs
```

The actual checked-out pages run against a synthetic SDK replacement and long golfer/team names. Draft/captain pages receive a partial draft with available golfers and a prior pick; scoring pages have nine populated teams. A separate player session captures the player Home and My Score view, plus the signed-out access page. Internal Extras scroll positions are captured separately. External networking is blocked, including all database writes. No real accounts, credentials or tournament records are used. The GitHub job runs only on `[self-hosted, macOS]` for the authorized release branch, with one-day synthetic artifacts. Nonzero exit status means a capture failed or a layout candidate needs review; it is never silently marked as passed.

## Authenticated development preview (local only)

Live preview mode requires a local Playwright session. Capture it with the guarded helper on your Mac (credentials are entered directly in its browser):

```
node tests/visual/save-session.cjs
```

The helper blocks tournament mutations during sign-in, including automatic player-account creation. It saves only to the ignored `playwright/.auth` directory with restricted file permissions. Then run:

```
ELLENG_PREVIEW_URL=https://elleng-cup-git-release-nov20-score-integr-97dac7-blaineg04-3428.vercel.app ELLENG_VISUAL_STORAGE_STATE=playwright/.auth/elleng.storage-state.json node tests/visual/run.cjs
```

Only the verified development preview or its verified release-branch alias is accepted; production/custom domains and unverified previews are refused. Update `PREVIEWS` only after checking Vercel project, commit and nonproduction target. Preview mode blocks all mutations except authentication refresh and read-only profile/account-list functions. It never clicks scoring, draft-pick, reset, archive or save buttons. Missing/expired sessions cause a failed capture, not a fake pass. A commissioner session is required for commissioner coverage.

Live screenshots and storage states must stay on your Mac; preview mode refuses CI execution. The result directory and auth files are git-ignored. Do not upload them as public Actions artifacts. The app's startup may attempt to create missing player logins; the request guard blocks that request and counts it in the report.

Optional `ELLENG_VISUAL_OUTPUT` selects a local result directory. `ELLENG_CHROMIUM_PATH` selects a local Chromium executable for environments where the standard browser download is unavailable. The default uses Playwright's pinned browser.
