# EllenG Cup staged production change manifest — 2026-10-22

**Review only. Not an authorization to merge, deploy, or run SQL.**

## Dependency order
1. PR #1 `release/nov20-score-integrity-20261020` → `main`.
2. PR #4 `fix/nov20-commissioner-test-fixture-20261022` → PR #1 branch.
3. PR #6 `development/disposable-postgres-acceptance-20261022` → PR #4 branch.

Each PR is currently draft. A green PR #6 test is **not** a combined final-release test against `main`. Recheck the eventual integrated SHA before deployment.

## What is actually user-facing?
- **PR #1:** `admin.html`, `captain.html`, `scoring.html`, `style.css`: score-integrity and commissioner/captain UI changes.
- **PR #4:** no new deployed runtime files; mainly test fixture, visual safety and release documentation.
- **PR #6:** `captain.html`, `common.js`, `draft.html`, `scoring.html`: Realtime recovery, pick-in-flight protections, UI connection reporting.
- `config.js` still embeds the existing live Supabase URL/project and draft ID. **Vercel preview is NOT a disposable draft sandbox.**

## Release material that must NOT be treated as automatic database changes
- `supabase.sql` is a reference schema; **do not execute against production**.
- `docs/proposed-realtime-publication-migration.sql` is only a reviewed proposal. Publishing individual/pair scoring tables may expose changes to authenticated subscribers; verify SELECT policies and privacy impact before approving.
- Disposable PostgreSQL / Realtime SQL in `tests/` is fixture/test-only and must never be pointed at the live project.

## Workflow and automation review
PR #1 adds workflows named `docker-storage-review`, `docker-volume-backup`, `docker-volume-restore-test`, `local-supabase-preflight`, `local-supabase-smoke` and `nov20-score-integrity`. These are repository workflows, **not production backup evidence**. Check each trigger and required secrets before merging any of them; never dispatch Docker or destructive workflow on the MacBook without explicit approval. PR #6 adds synthetic testing and disposable PostgreSQL workflows: no Docker or paid resource required on the hosted tests.

## Evidence available
- Current development SHA prior to this document: `fc2de437`, scoring and disposable database checks green.
- Synthetic browser matrix passed at `980deabe` (239 views, 7 widths, zero reported problems).
- The latest CI checks cannot substitute for a real authenticated, two-device rehearsal on isolated Auth/PostgREST/Realtime.

## Production rollback pin
Production deployment `dpl_FbiibvrkEcsYBvT6EojMxxrtNwYs`, `main` SHA `27efe937a0e7f12fae1a2750dc6a7fcc983832df`, alias `https://elleng-cup.vercel.app`. Mark as known deployed baseline, not proven rollback restoration.

## Go/no-go
**NO-GO for production merge or schema change** until complete integrated changes are reviewed, isolated authenticated multi-device draft/scoring acceptance is proven, rollback of production app and data strategy is checked, and the owner explicitly authorizes release. Development previews and synthetic tests can continue.
