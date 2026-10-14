# EllenG Cup accelerated development plan — 2026-10-14

## Scope and non-negotiable boundaries
- Repository: `blaineg04/EllenG-Cup`; development base: `development/elleng-audit-20261013`.
- Never modify FairwayOS, `main`, live Supabase schema/functions/data, or production deployment without explicit approval.
- Preserve existing Standard EllenG, Split-Pair Scramble, draft, Gator Hole, and Final Cargo.
- The additive Two-Team Individual Points format remains development-only until an end-to-end beta passes.
- No new paid tools or hosting.

## Delivery method
- Deliver **one complete, demonstrable vertical slice per milestone**, not isolated defensive micro-commits.
- Codex work, if configured by the owner, uses short-lived task branches off the development base; one writer per branch. Do not imply Codex is connected or running until verified.
- Each feature batch includes implementation, focused local tests, regression coverage, and a brief test evidence report. Trigger self-hosted macOS CI on the reviewed integration commit; investigate related failures together.
- Merge only after tests pass. Do not auto-merge to main. Keep a concise milestone ledger with statuses: planned, in progress, blocked, verified.
- Prefer reusable tests that exercise behavior, not only static source text assertions.

## Milestone 1 — Disposable PostgreSQL score-save integration
Status: IN PROGRESS; NOT YET VERIFIED against PostgreSQL.
Deliverables:
1. Confirm local PostgreSQL tooling and provision a **disposable loopback-only** `elleng_points_test_<suffix>` database on the owner's MacBook (owner action where needed).
2. Run the opt-in local SQL smoke test and record actual results; avoid any remote or live DB.
3. Add transactional concurrent-write tests (two clients with the same revision), stale retry, par conflict, roster ownership, and pickup handling.
4. Align JS and SQL score contract; resolve score limits and missing albatross points rule explicitly rather than guessing.
5. Design and test caller authorization before any hosted migration.
Exit: repeatable green real-PostgreSQL integration test plus documented limits and no live DB changes.

## Milestone 2 — Full development-only Two-Team Points UI
Status: PLANNED.
Deliverables: commissioner setup, balanced two-team rosters with flexible sizes, per-golfer scoring, pickup, score editing, live leaderboard, revisions/conflict feedback, mobile layout. Keep old formats unchanged.
Exit: two browsers can run a complete simulated event in a safe test environment.

## Milestone 3 — Full tournament simulation
Status: PLANNED.
Test commissioner/captain/player/viewer permissions, disconnect/reconnect, simultaneous submissions, score edits, 18-hole completion, finalization, and regression of all existing formats.
Exit: scripted and manual end-to-end checklist passes.

## Milestone 4 — Controlled beta readiness
Status: PLANNED.
Fix blocking defects, mobile fit, recovery paths, and regression gaps; prepare an approval-gated beta deployment plan. No production changes until explicit authorization.

## Current verified baseline
- GitHub Actions scoring regression passed at commit `611573e096348dccf7c96432b2fa502308301d0a`: https://github.com/blaineg04/EllenG-Cup/actions/runs/38615526212
- The local PostgreSQL smoke runner exists and is opt-in, but no successful real-database run has been evidenced.
- The new format's engine and standalone preview exist; full hosted persistence and multi-device integration do not.

## Blockers / decisions
- Local disposable PostgreSQL installation/connection and opt-in test configuration.
- Define albatross (par 5, two strokes) points; current engine rejects it.
- Determine identity/authorization policy for player score submissions before any hosted persistence.

## Status report template
Milestone | committed code | passing CI | real DB / multi-device verification | blockers | next deliverable.
