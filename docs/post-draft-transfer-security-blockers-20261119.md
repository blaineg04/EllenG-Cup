# Post-draft transfer database integration: verified security blockers

Read-only inspection of EllenGCup Supabase project `xepccqedhbucpbwuykoc`, November 19, 2026.

1. The 29 in-memory tests passed in GitHub Actions (run 44583155610); this does **not** prove PostgREST/RLS/trigger behavior.
2. Catalog search found no existing `elleng_*transfer*`, `elleng_*withdraw*`, or `elleng_*restore*` routine in the live public schema at inspection time. This is surprising because the installed weighted guard references an `elleng_withdraw_golfer(...)` signature by regprocedure. **Investigate the discrepancy** before proposing to replace the guard. The earlier guard audit quoted the installed definition; it did not prove the referenced function exists.
3. RLS policies on `elleng_drafts` include `elleng_owner_update` and generic authenticated SELECT/INSERT policies. `elleng_tournaments` includes a draft-owner management policy and authenticated SELECT. Their full predicates and direct-table privileges must be inspected before security claims.
4. The live guard permits some teams-only changes to bypass its completed-draft golfer-change check, whereas combined team + golfer changes are blocked. A transfer implementation must avoid making this weaker.
5. Any RPC must use the scoring-compatible lock order (tournament then draft), independently validate auth.uid against draft.owner_id, require setup status and no scores in all three tables, verify team membership and noncaptain, and check updated_at. A caller-provided `scoresExist` boolean is **never authoritative**.
6. Before executable SQL: verify installed guard dependencies and function owners; inspect full RLS predicates, table grants, trigger definitions, and scoring lock behavior. Then implement an isolated PostgreSQL fixture and tests. Do not deploy a migration or change production without explicit approval.

No live data was modified.

## Dependency resolution and RLS follow-up

**Correction to item 2:** The function `public.elleng_withdraw_golfer(text,text,timestamptz,integer,text)` **does exist** in production, owned by `postgres`. The earlier catalog call contained two SELECT statements and surfaced only the final result set; absence from that output was not evidence of absence. A single-result function-name query confirmed the function. Do not remove, rename, or replace it.

Read-only `pg_policies` inspection confirmed:
- `elleng_owner_update` UPDATE `USING` and `WITH CHECK` both compare `auth.uid()` to `owner_id`.
- `authenticated can read draft` SELECT policy has `USING (true)`.
- Both authenticated INSERT policies check `auth.uid() = owner_id`.

These are row-level policies, **not** an adequate post-draft transfer authorization mechanism by themselves. An RPC must enforce commissioner identity, complete roster integrity, draft state, no-score gate, lock ordering, and optimistic concurrency. The existing withdrawal function must remain functional.

All inspection was SELECT-only. No production mutation.
