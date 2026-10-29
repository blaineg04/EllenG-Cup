# Hosted recovery baseline — 2026-10-29

Target: EllenG Supabase xepccqedhbucpbwuykoc. Read-only inspection; no production changes.

## Captured evidence
hosted-catalog-20261029.json captures five tables at 2026-10-29T20:22:50.262979+00:00, PostgreSQL 17.6: columns/defaults, constraints, table owners/ACLs, row policies, RLS settings and user triggers. It contains catalog metadata only, not player or score records.

All three score tables had zero records at inspection. This observation expires when scoring starts; take a fresh backup before deployment. The team score CHECK is still 1–20; no user triggers exist on the five captured tables. All three score tables have RLS and restrictive active-tournament guards alongside permissive ownership policies. Current Shamble write ownership policies still reference the fixed elleng-cup draft ID.

## Recovery evidence and limits
CI run 40947141546 passed the disposable PostgreSQL acceptance job, including its pre-install dump/restore and coordinated installation checks. This uses tests/acceptance/disposable-integrated-migration-schema.sql, a minimal schema without the full hosted constraints/policies. It is NOT a hosted-schema restore rehearsal.

This catalog capture is NOT a pg_dump backup: it omits dependent auth/captain objects, function definitions, indexes beyond constraints, sequences, publications, extension dependencies and data. Do not use it as the sole recovery artifact or claim production recovery is verified.

## Next executable milestone
1. Obtain a private custom-format pg_dump of the existing hosted database from an authorized database connection. Keep credentials and user records out of this public repository.
2. Restore into a native disposable PostgreSQL instance with compatible Supabase role/auth dependencies; verify definitions, grants, policies, constraints and row contents, not only table counts.
3. Apply the coordinated install candidate only in that disposable restore; verify all formats/roles/concurrency, then rehearse rollback with post-install scores including Split-Pair totals above 20.
4. A rollback that reinstates the old 1–20 CHECK must explicitly handle valid totals above 20 without silently deleting scores. Do not assume schema rollback alone is sufficient.
5. Generate a deployable artifact only after these checks; review and approve exact digest before hosted SQL, then run dedicated authenticated two-device acceptance.

No PostgreSQL client/server is installed in this chat workspace. Supabase SQL access is available for catalog reads, but no verified hosted dump/restore connection has been established here. Native disposable recovery testing remains available in GitHub CI; its current fixtures do not replace step 1.
