# EllenG Cup responsive validation implementation plan

Goal: inspect the release branch at widths 320, 375, 390, 430, 1024, 1440 and 1920 without Docker, paid services, or production changes.

1. Add a Playwright runner that captures viewport and full-page screenshots, measures horizontal overflow, clipped controls/text and overlapping interactive controls, and writes a JSON report. Use representative synthetic tournament data and the actual unmodified HTML/JS. Never contact a live database in fixture mode.
2. Add an explicit preview mode using an existing local Playwright storage-state file, only for verified preview hosts. Reject all tournament writes. Never upload live screenshots, credentials, or session files to public CI artifacts.
3. Run the fixture suite on the existing self-hosted macOS runner and inspect failures/screenshots. Fix confirmed source issues, run the scoring regression suite, and repeat the affected views.
4. Report fixture coverage separately from live preview coverage. A fixture pass is not authenticated production validation.

Files: tests/visual/{package.json,package-lock.json,fixture.cjs,run.cjs,README.md}; .github/workflows/nov20-score-integrity.yml; confirmed layout fixes only in scoring.html/draft.html/captain.html.

Review focus: long names; nine-team rosters; mobile fixed navigation; scroll containers vs hidden controls; missing/expired preview authentication; no real tournament writes.

Execution: inline, as authorized by the user. Existing isolated release checkout is the workspace. The normal Chromium download failed in this environment; use the Mac runner and, if available, a packaged headless Chromium for local synthetic checks.
