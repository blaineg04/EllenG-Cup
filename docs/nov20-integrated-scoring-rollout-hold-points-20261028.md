# EllenG scoring rollout: integrated gate (REVIEW ONLY)

**Target:** existing EllenG Supabase project `xepccqedhbucpbwuykoc`. Nothing in this checklist authorizes production SQL execution. Never deploy to FairwayOS.

## STOP: current incompatible proposals

1. `db/patches/20261028_split_pair_team_total_range_REVIEW_ONLY.sql` widens the team-score check to 40. **Do not deploy it alone**: existing direct standard team score writes could then submit 21–40 without an additional format-aware server constraint.
2. `db/patches/20261028_split_pair_atomic_rpc_REVIEW_ONLY.sql` uses **SECURITY DEFINER**. Validate dedicated owner privileges, `auth.uid()`, caller identity, existing RLS behavior, search path, and trigger lock ordering. The `public` RPC requires explicit EXECUTE ACL verification.
3. `tests/acceptance/authorized-shamble-rpc-proposal.sql` is **SECURITY INVOKER** and currently does **not** GRANT EXECUTE to authenticated. Its RLS and permissions must pass real-identity tests first.
4. `db/patches/20261028_shamble_dynamic_draft_policies_REVIEW_ONLY.sql` removes the hardcoded draft ID but **still permits direct write paths**. Deploying it alone does not guarantee atomic derived scoring.
5. `db/patches/20261028_tournament_config_score_guard_REVIEW_ONLY.sql` is a function proposal, **not installed triggers**. The proposed privileged parent lock must be audited under the actual role and row-lock behavior.
6. The hosted project currently has direct authenticated DML on all three score tables. Do not revoke these grants without confirming the **standard Scramble** browser path remains operational.

## Atomic deployment sequence (after approval and rehearsal)

- Capture schema-only and score-table backup plus policy/function/trigger/privilege definitions; verify restoration in an isolated database.
- Agree on a maintenance window, operator credentials, and a rollback decision owner; freeze active tournament scoring during deployment.
- Finalize **one transaction-bound migration** covering safe constraints, the team-count and format guards, both RPCs, authorization policies and EXECUTE privileges. Ensure all objects reference existing table structures and no concurrent score writes can bypass the guards.
- Run disposable PostgreSQL role/concurrency tests against the *actual migration*, including standard score 1–20, Split-Pair combined 2–40, Shamble derived team score, clears, finalized-tournament denial, roster membership, cross-tournament denial, captain reassignment denial, and repeat submissions.
- Deploy **only after explicit production approval**, run the strict deployment preflight and schema/ACL diff, then exercise a dedicated approved test tournament with two authenticated accounts/devices and verify live leaderboard subscription and resume behavior.
- Abort and restore if any authorization, score derivation, or live sync test fails. Do not use November 20 event scores as test data.

## Current GO/NO-GO

- GO: disposable PostgreSQL policy fixtures, code-only rehearsals and read-only live catalog inspection.
- **NO-GO: hosted scoring** until the integrated migration and two-device validation are complete.
