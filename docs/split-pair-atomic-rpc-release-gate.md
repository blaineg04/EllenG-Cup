# Split-Pair atomic scoring — release blocker

Status: **design contract only**. Not deployed and not an authorization grant.

## Current race
In `scoring.html`, `savePairScore` writes `elleng_pair_hole_scores`, refreshes both pair rows, and separately writes or deletes `elleng_team_scores`. Two devices can interleave their operations, leaving a stale team total or a deleted total despite two valid pair entries. A client-side mutex only protects one browser.

## Required single server-side operation
Implement a **server-authorized PostgreSQL RPC** with inputs `p_tournament_id`, `p_team_index`, `p_hole`, `p_pair_index`, `p_score` (nullable to clear). It must:

1. Require `auth.uid()` and independently verify tournament membership/commissioner or the authorized captain/team relationship using trusted DB rows, **not** supplied metadata or client `canEditTeam`.
2. Validate tournament, team, hole 1..18, pair index 0..1, the selected Split-Pair format, exactly four distinct roster golfers, and integer score 1..20 (or NULL for clear).
3. Serialize all writes for the tuple `(tournament_id, team_index, hole)` with a transaction-scoped advisory lock or locked parent row. Do not rely on row-locking a missing score row.
4. Within **one database transaction**, upsert/delete the selected pair score, read both pair scores, and upsert the exact sum only if both valid; otherwise delete the team score. Preserve the original hole from the request.
5. Return the authoritative pair/team result. Ensure second submissions cannot regress the total, and that access violations fail without writes.
6. Restrict `EXECUTE` to `authenticated`, revoke `PUBLIC` and `anon`; use a fixed search path, schema-qualified tables, and carefully reviewed invoker/definer privileges. Never expose a `service_role` key in browser code.
7. Update the browser to call **only the RPC**, with no fallback to separate writes. Keep the save busy until it reloads canonical scores.

## Required isolated acceptance tests
- First pair score alone => no team score; second score => exact sum.
- Concurrent pair 0 and pair 1 writes => exact sum regardless of order.
- Concurrent update and clear => persisted team total equals final pair values.
- Repeated identical write => idempotent; duplicate or missing roster => rejected.
- Unauthorized user, other team, no session, wrong format => rejected with no write.
- Invalid hole, pair, stroke, tournament => rejected with no write.
- No stale total when a score is cleared after two complete pairs.

Do not apply a migration to the live Supabase project or switch browser writes until the exact table constraints, role policy, and isolated PostgreSQL concurrency tests are checked. The November 13 rehearsal remains blocked on this path.
