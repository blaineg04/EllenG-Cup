# EllenG Cup — controlled production release candidate (2026-10-22)

**State: NOT APPROVED TO DEPLOY.** This file is a checklist, not an authorization to merge, publish, or change production data.

## Intended milestones
- Draft rehearsal ready by **November 13, 2026**; tournament **November 20, 2026**.
- First staged production update may occur sooner **only after gates below are satisfied**.
- No FairwayOS changes and no production database test writes.

## Change set under review
Development PR [#6](https://github.com/blaineg04/EllenG-Cup/pull/6) based on `fix/nov20-commissioner-test-fixture-20261022`; release PR #1 and dependent PR #4 must be reconciled before considering production. PR #6 contains:
- UI/runtime: `captain.html`, `common.js`, `draft.html`, `scoring.html`
- Reference-only SQL: `supabase.sql`; **do not run wholesale against live DB**
- Proposed guarded publication migration: `docs/proposed-realtime-publication-migration.sql`; **not approved/applied**
- Workflows, tests, and review documentation, not part of the deployed user experience.

## Gate 1 — source / environment audit
- [ ] Review complete commit dependency chain and exact final diff against `main`, including PRs #1, #4, and #6.
- [ ] Confirm Vercel production project and deployment ref, and preview/production environment variables.
- [ ] Confirm `config.js` uses live project `xepccqedhbucpbwuykoc` / draft `elleng-cup`; preview is **not isolated**. Never make rehearsal picks there.
- [ ] Ensure reference SQL and proposed migration cannot execute automatically during deploy.
- [ ] Review Supabase Realtime publication, SELECT/RLS grants and privacy scope before any migration.

## Gate 2 — verification
- [x] CI scoring and isolated PostgreSQL acceptance checks passed at `0fc396cb`.
- [x] Seven-width synthetic visual test passed on predecessor `980deabe`: 239 captures, zero detected layout/navigation issues.
- [ ] Rerun visual suite against final exact release SHA; inspect artifacts for layout quality.
- [ ] Authenticated commissioner + distinct captains on isolated nonproduction Auth/PostgREST/Realtime stack; test simultaneous picks, timer, reconnection, and public viewer.
- [ ] Authenticated live-scoring end-to-end flow against isolated data.
- [ ] Confirm no duplicate/missing player or team scores after reconnect and concurrent submission.

## Gate 3 — rollback and release
- [ ] Record current production Vercel deployment ID, Git SHA, working URL and last-known-good status.
- [ ] Export/verify database restore plan and preserve pre-release schema/config snapshots; no destructive migration without separate approval.
- [ ] Document rollback: restore prior Vercel production deployment; if schema changed, use reviewed forward-compatible database reversal/restore.
- [ ] Schedule short release window, obtain explicit deployment approval, deploy in stages, then check commissioner/captain read-only views and monitoring.
- [ ] Test real authorized draft writes **only** after ensuring they cannot disturb the actual tournament.

## Current blocker and next action
Supabase free-project quota prevents a third hosted QA project without modifying existing subscriptions. Do not disable FairwayOS or EllenG Cup. Continue developing a completely local/CI-hosted isolated authentication fixture, or obtain a separate explicitly approved QA environment. Browser-only synthetic tests **do not** replace the authenticated release gate.

## Verified production rollback reference — October 22
- Vercel project: `elleng-cup` (`prj_wpcMGLHuH21jWarwziP1mo85RBcC`).
- Last listed READY production deployment: `dpl_FbiibvrkEcsYBvT6EojMxxrtNwYs`, source branch `main`, full SHA `27efe937a0e7f12fae1a2750dc6a7fcc983832df`.
- Current production alias: `https://elleng-cup.vercel.app` (do not alter until gates pass).
- Previous Vercel deploy can potentially be restored, but actual rollback operation and DB compatibility have **not** been exercised; this is a recorded reference, not proof of recovery.
- Verified PR dependency chain: PR #1 → `main`; PR #4 → PR #1 branch; PR #6 → PR #4 branch. All are draft, unmerged.
- CI `ddbfef20`: scoring and disposable PostgreSQL passed; responsive job skipped. Last seven-width synthetic suite passed at `980deabe`.
