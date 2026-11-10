# Production weighted-draft drift — read-only preflight (2026-11-09)

Project: EllenG Cup only. This file records observations, **not permission to run SQL**.

## Verified against live catalog (read-only)
- `elleng_weighted_reachable(integer,integer,integer[],integer[],integer[],boolean)` is **absent**.
- `elleng_weighted_options(jsonb)`, `elleng_weighted_pick(text,integer)`, `elleng_prepare_weighted_draft(text)`, `elleng_validate_weighted_save(jsonb,jsonb)`, and `elleng_guard_weighted_roster()` are present.
- `elleng_make_pick` and `elleng_auto_pick` already route to `elleng_weighted_pick`.
- The enabled `elleng_weighted_roster_guard` trigger exists, but the installed guard starts with a different conditional than the tested `install.sql`. Installed guard returns when either OLD or NEW rules are not weighted; release guard returns only when OLD rules are not weighted, and explicitly rejects disabling weighted rules.
- Production Vercel commit: `e3bbad41982db535b447d56d4aac80359d8f79f3` (`main`). Tested PR #66 branch commit at initial preflight: `00f3a2a4a8c3e7a7a7676c10be5c7b6238650a99`.

## Release decision
**BLOCKED** until the missing function and guard mismatch are reconciled. The existence of other weighted functions does not prove their bodies are identical to the tested release. Do not run the entire `install.sql` blindly, and do not deploy the weighted client yet.

## Safe next steps
1. With commissioner authorization, obtain a secure operator-controlled backup of the existing function definitions, grants and trigger, and verify recovery.
2. Compare the *complete* live definitions of weighted options, pick, preparation, validation, and guard against the tested migration. Keep live function definitions and user data out of GitHub.
3. Prepare a minimal, reviewed, transactional reconciliation of **only** proven differences. Do not overwrite unexamined functions or modify golfer rows.
4. Re-run isolated PGlite tests against the exact reconciliation SQL, including 22/23/24-golfer cases, and check privileges and roster protection.
5. Seek separate explicit approval to apply the reconciliation in production. Verify catalog and callable behavior afterward, then seek approval for client deployment.
6. Complete authenticated commissioner/captain and score-save acceptance before announcing draft readiness.

No production mutation is authorized by this document.
