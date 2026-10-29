# EllenG Cup scoring migration — production approval checklist

**State: NOT APPROVED.** The disposable PostgreSQL RPC role checks passed for Scramble, Shamble, Split-Pair and commissioner reset; coordinated migration/security audit passed in CI #877. No hosted deployment or two-device authenticated scoring verification has occurred.

## Scope for a single transactional migration
1. Record a verified restore point and export current function definitions, RLS policies, grants, constraints and triggers on the three score tables, drafts and tournaments.
2. Install format-aware score-range constraint and tournament/draft concurrency guards.
3. Install authorized Scramble, Shamble and Split-Pair score RPCs with an explicitly verified, trusted function owner and locked search path. Check that owner can perform writes after API grants are revoked and no untrusted role can replace the functions or objects they reference.
4. Replace hardcoded draft-ID score policies. Revoke INSERT/UPDATE/DELETE/TRUNCATE from PUBLIC, anon and authenticated on the three score tables; assert ACLs, RLS and RPC execution grants inside the same transaction.
5. Run strict preflight checks and record approvals before COMMIT.

## Deployment gates
- Review a **single executable artifact** against a production-shaped schema, including its actual owner and direct-DML lockdown.
- Confirm no scoring page still writes directly to locked tables (including administrative clear/reset paths).
- Repeat isolated tests as authenticated captain, commissioner, unauthorized captain and anonymous caller for each format.
- Verify backup recovery, transaction rollback and post-deployment health check instructions.
- Obtain explicit approval of the exact SQL and rollback procedure; production changes require a separate decision.

## Rollback
- If verification fails before COMMIT: ROLLBACK (nothing installed).
- After COMMIT: do not blindly restore the earlier permissive score policies or grants. Disable scoring writes, preserve new score rows and their timestamps, then use the predeployment schema snapshot and a reviewed forward repair or point-in-time restore. Verify recovery on an isolated database first.
- An application rollback must be paired with a database-compatible scoring RPC version; reverting to an older client that writes score tables directly will fail after lockdown.

## Unresolved blockers
- The current migration builder intentionally raises a review-only exception and cannot be deployed.
- Authorized RPC owner/role grants and hardcoded policies need complete hosted-schema reconciliation.
- Commissioner score-reset RPC and restricted-role fixture have passed disposable PostgreSQL checks; live compatibility remains unverified.
- Live authenticated two-device scoring verification remains pending.

## Verified CI evidence (2026-10-29)
- Disposable coordinated migration commit plus RLS/ACL post-install check: PostgreSQL acceptance #902.
- Pre-install dump and independent disposable restore: PostgreSQL acceptance #904.
- These tests do NOT validate hosted backup retention, point-in-time recovery, or a production restore; verify restore capability and capture a hosted snapshot before approval.

## Approval handoff requirements
- Provide an exact immutable SQL artifact and checksum, reviewed changes to score policies/ACLs/triggers, SQL owner identity and rollback compatibility.
- Run the strict four-RPC preflight on a hosted-schema replica; inspect all existing score-write policies (especially hardcoded draft IDs).
- Record commissioner-approved maintenance window and ensure the matching RPC-based browser client deploys together with the database change.
- Do not execute the guarded disposable-test SQL or remove its intentional abort and present that as production-approved SQL.

## Policy-cleanup verification — 2026-10-29
- Disposable PostgreSQL acceptance #921 passed with coordinated removal of nine legacy active-event scoring write policies.
- This is not a live authorization test. Before approval, verify RPC calls as an authenticated captain and commissioner, reject unauthorized and anonymous writes, and confirm SELECT-based leaderboards remain available.
- Freeze the new policy-cleanup patch in the exact SQL checksum; prior manifests are superseded by any SQL change.

## Updated isolated evidence — 2026-10-29
- PostgreSQL acceptance #928 PASSED after fixture SELECT-grant correction; verifies coordinated install, four RPC grants, no nine legacy broad policies, and authenticated score-table SELECT grants.
- MacBook isolated scoring rehearsal #266 PASSED; not equivalent to hosted authenticated two-device testing.
- Production approval remains blocked pending hosted-schema exact SQL review, backup recovery evidence and role-based end-to-end score writes.

## Test realism gap requiring closure
- **Resolved in isolated CI:** the disposable integrated schema now reads a session-specific JWT subject through `auth.uid()`. Post-install SQL exercises captain, commissioner, unauthorized and missing-identity scenarios; this is still not a hosted two-device test.
- PostgreSQL acceptance #949 passed installed Scramble, Shamble and Split-Pair scoring behaviors plus commissioner reset checks. These are simulated JWT subjects under disposable PostgreSQL, not actual Supabase Auth sessions.
- Hosted role/ownership compatibility, actual authenticated multi-device scoring, production recovery and exact SQL approval remain open.

## Hosted read-only security review — 2026-10-29
- PostgreSQL 17.6; hosted `auth.uid()` is owned by `supabase_auth_admin` and is not SECURITY DEFINER. No proposed `elleng_test_*` scoring RPCs are installed yet.
- Supabase security advisor flags three existing authenticated-callable SECURITY DEFINER draft RPCs (`elleng_auto_pick`, `elleng_make_pick`, `elleng_save_state_if_fresh`). Confirm their intended privileges and owner/captain checks before production approval; do not revoke blindly because draft functionality depends on them.
- Advisor also flags RLS with no policies on `elleng_golfer_pins` and `elleng_trash_talk_settings`, plus disabled leaked-password protection. Evaluate separately; none were changed.
- Isolated role-behavior tests use simulated JWT subjects in a disposable database. They do **not** substitute for running API requests as actual `authenticated` and `anon` roles through hosted Supabase Auth. Review this gap before approval.

## Latest release gate — 2026-10-29
- Disposable PostgreSQL acceptance #960 passed after the four-RPC owner, SECURITY DEFINER, explicit search_path and EXECUTE ACL checks were corrected.
- This validates the disposable install only; the hosted database does not yet contain the new RPCs.
- **NO-GO until:** freeze generated SQL and hash, verify a production-compatible backup and restore procedure, review hosted privileges/schema drift, approve the exact migration and matching frontend release, then perform authenticated two-device scoring after deployment.
