# EllenG Cup scoring migration — production approval checklist

**State: NOT APPROVED.** The disposable PostgreSQL RPC role checks passed for Scramble, Shamble and Split-Pair. No hosted deployment or two-device authenticated scoring verification has occurred.

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
- The app's commissioner score-reset path must be migrated before table ACL lockdown.
- Live authenticated two-device scoring verification remains pending.
