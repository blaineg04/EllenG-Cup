# Local draft integration test setup (MacBook)

**Preparation only.** No local database has been created by this document. No connection to the production Supabase project is authorized.

## Prerequisites

- macOS with a local PostgreSQL instance and `psql` available, or a disposable PostgreSQL container.
- A **separate local database** named `elleng_draft_test` and a dedicated low-privilege test role.
- SQL migrations copied from the reviewed development repository or exported schema definitions, with all production secrets, auth identities and player data excluded.

## Before any SQL

Set a connection string pointing strictly to loopback and the disposable database, e.g. `ELLENG_TEST_DATABASE_URL=postgresql://tester:LOCAL_TEST_PASSWORD@127.0.0.1:5432/elleng_draft_test`.

Run `node scripts/check-local-draft-db.cjs`. It checks the URL only; it does not connect.

Do not put credentials in Git, CI logs, or documentation. Do not use `SUPABASE_DB_URL`, live service-role keys, or a production database dump.

## Isolated integration sequence

1. Create the local disposable database and role manually after verifying the target; use test-only credentials.
2. Import only the reviewed table/function definitions needed by the draft, including required auth stubs and extensions.
3. Seed fictional drafts and golfers. Ensure `elleng_make_pick`, `elleng_auto_pick`, and `elleng_pick_balance_penalty` are present with expected signatures.
4. Capture baseline behavior on an expired timer with remaining `A` golfer and a nonzero band penalty.
5. In a fresh fixture, apply the proposed minimum-penalty automatic picker and compare behavior.
6. Test simultaneous callers, unauthorized callers, paused drafts, premature timer calls, and completed drafts.
7. Tear down the disposable database after collecting anonymized test results.

## Stop conditions

Do not run if the host is not loopback, the database name is not `elleng_draft_test`, the test user has production access, or the SQL includes live tournament records.

The GitHub Actions workflow currently runs **only** pure Node regression and URL-preflight tests; it does not provision PostgreSQL or execute database integration tests.
