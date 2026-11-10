# Minimal weighted-draft production reconciliation — plan only

**Status: NOT APPROVED / NOT APPLIED.** Prepared after read-only catalog checks. This is not executable migration SQL.

## Verified mismatch
- Production `public.elleng_weighted_reachable(integer,integer,integer[],integer[],integer[],boolean)` is absent.
- Production `public.elleng_weighted_options(jsonb)` does **not** call reachability. The tested PR #66 implementation **does**. Installing only the missing function would leave the old decision engine active.
- Production `public.elleng_guard_weighted_roster()` differs from tested release: it returns early when either old **or new** rules are non-weighted; tested release rejects switching an active weighted draft away from weighted rules.
- Production weighted pick and preparation RPCs exist, but complete parity with the tested definitions is not established.
- Production already routes make-pick and auto-pick through weighted-pick; do not reapply those wrappers without a proven need.

## Intended narrow repair
1. Back up exact live function definitions, grants, trigger and database restore path privately, not in GitHub.
2. Compare complete live `weighted_options`, `weighted_pick`, `prepare_weighted_draft`, `validate_weighted_save` bodies with the release definitions.
3. Build a guarded transactional patch that adds `weighted_reachable`, replaces `weighted_options` with the reviewed reachability-aware version, and repairs the roster guard. Include additional functions **only** where comparison proves necessary.
4. Use `to_regprocedure` and expected body hashes to fail closed on unexpected production drift. Preserve current execute grants and security-definer characteristics; check function ownership and caller privileges.
5. Test the exact patch against an isolated PostgreSQL snapshot/fixture (22/23/24 golfers, A/B protection, authorization, cancellation, draft completion), including replay/idempotence behavior.
6. Request separate explicit authorization for the live SQL and client deployment; verify post-install, then test real authenticated flow.

**Do not run the full install.sql on production. Do not touch draft rows, golfers, handicaps or scores.**
