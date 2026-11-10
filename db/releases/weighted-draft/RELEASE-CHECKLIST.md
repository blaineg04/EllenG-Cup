# Weighted draft release gate — PR #66

**Status:** Review checklist only. Do not run this migration against production or merge the PR without explicit commissioner approval.

## Verified in isolated CI
- 104 Node tests; complete 23-golfer (11/12) and 24-golfer (12/12) snake simulations.
- 360 JS/PostgreSQL state comparisons, authorization and timeout paths.
- Maximum 32-golfer initial calculation and 33-golfer rejection.
- PGlite migration installation twice in disposable test database.

## Production preflight (read-only, approval required)
1. Confirm the deployed application revision and the exact installed definitions of `elleng_save_state_if_fresh(timestamptz)` **with its full actual signature**, `elleng_make_pick(text,integer)`, and `elleng_auto_pick(text)`. The install script uses `pg_get_functiondef` with exact text markers; if production definitions differ, **stop**, do not force a replacement.
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
