# Weighted draft release gate — PR #66

**Status:** Review checklist only. Do not run this migration against production or merge the PR without explicit commissioner approval.

## Verified in isolated CI
- 107 Node tests, including rejected commissioner RPC safety; complete 22-golfer (11/11), 23-golfer (11/12), and 24-golfer (12/12) snake simulations, confirmed by MacBook CI run #36.
- 360 JS/PostgreSQL state comparisons, authorization and timeout paths.
- Maximum 32-golfer initial calculation and 33-golfer rejection.
- PGlite migration installation twice in disposable test database.

## Production preflight (read-only, approval required)
1. Confirm the deployed application revision and the exact installed definitions of `elleng_save_state_if_fresh(text,timestamp with time zone,jsonb)`, `elleng_make_pick(text,integer)`, and `elleng_auto_pick(text)`. The install script uses `pg_get_functiondef` with exact text markers; if production definitions differ, **stop**, do not force a replacement.
2. Capture the original function definitions, grants, existing trigger definitions, and the current database schema version in a secure operator-controlled backup. Do not put production SQL dumps, player data, or credentials in GitHub.
3. Verify no live draft is in progress, and arrange a maintenance window. Confirm a restorable database backup/snapshot and a tested restoration procedure. No production reads or writes are authorized by this checklist.
4. Confirm the client version being released includes `weighted-draft.js`, the `balanceVersion===1` eligibility check, and the commissioner/captain RPC routes.
5. Obtain explicit approval for both migration and production deployment. Database functions must be installed **before** publishing the weighted client.

## Installation and smoke verification (only after approval)
1. Apply `install.sql` as one transaction. Any marker mismatch must roll back the whole transaction.
2. Verify new functions, permissions, and roster guard exist. Ensure legacy drafts still follow their pre-existing rules.
3. Use an isolated test draft (not the real tournament) to verify commissioner preparation, captain authorization, legal/illegal A/B picks, pause/resume, and 23-player uneven roster handling.
4. Publish the reviewed client build; verify commissioner and captain browser screens and real-time refresh. Keep the production tournament draft paused until approval to start.

## Rollback
- **Do not assume redeploying the old client reverses SQL.** The migration replaces existing functions and creates a trigger; rollback needs the backed-up pre-migration function definitions and removal of newly added functions/trigger where safe.
- If the migration fails inside its transaction, verify rollback before retrying.
- If browser smoke tests fail after migration, stop the draft and restore the previous client first; decide whether database rollback is required after reviewing the current state and captured definitions.
- Never restore an old database snapshot over new tournament data without an explicit recovery decision.

## Remaining release blocker
Authenticated browser end-to-end verification of commissioner and captain pages has **not** been completed. Isolated VM and PostgreSQL tests do not establish browser or production readiness.

## Authenticated browser acceptance — not yet executed
Run these steps in a separate staging environment with dedicated test accounts and disposable draft data, **not** against the live November 20 tournament:
1. Sign in as commissioner, confirm the active golfer count and all submitted bands, and verify that preparation is blocked while any participating golfer is unranked.
2. Prepare a snake draft with Jarad (A) and Carl (B) as captains; verify both are preassigned, each team starts with one golfer, and the first selectable team follows the configured snake order.
3. On Carl's first eligible turn, verify a second B is unavailable while Jarad has no B; confirm an allowed C can be selected. Check that the captain page, commissioner page, and public draft view agree after refresh.
4. Sign in as the wrong captain and try a pick; verify the server refuses it and neither browser displays an extra golfer. Repeat while offline and after signing out.
5. Confirm timer pause/resume and timeout selection preserve legal eligibility; test a concurrent commissioner/captain pick to ensure only one authoritative result is saved.
6. Finish a 23-player draft (11/12) and a 24-player draft (12/12); verify all participants are assigned exactly once and spectators/non-playing golfers are never drafted.
7. Refresh each page and verify state persists. Check desktop and mobile widths for readable band badges, full names, and usable controls.
8. Record browser, commit SHA, test account roles, pass/fail evidence, and any unresolved issues before marking this gate complete.

A successful Node/PGlite CI run is **not** a substitute for these authenticated browser checks.
