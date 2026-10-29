# EllenG Cup — October 30 operational-readiness gate and November 20 tournament

Updated: 2026-10-27. **Owner-requested readiness target: Friday, October 30, 2026, for draft and scoring together.** November 20 remains the tournament date. This checklist tracks **unverified live evidence**, not an assertion that the tournament is ready.

## October 27 latest integrated green baseline

- Development branch commit `6b7ebb99` (`fix(draft): fence captain picks during pending realtime refresh`) passed **all four** triggered workflows: responsive acceptance `40567269030`, release candidate safe checks `40567269145`, disposable PostgreSQL contract `40567269186`, and scoring reconciliation `40567269254`.
- The draft change touched `common.js` and `tests/draft-two-client-simulation.test.cjs`, adding a concurrent client regression. This evidence remains synthetic/disposable, **not** a successful hosted authenticated rehearsal.
- Preserve the green baseline and isolate future fixes; do not merge/deploy to production until authenticated commissioner/captain and multi-device scoring acceptance, backup, and rollback are verified.

## October 27 updated CI evidence (read-only)

- Commit `4535f276`: scoring reconciliation run `40561623668` **passed**; release-candidate safe checks run `40561623705` **passed** (synthetic and seven-width visual matrix).
- Commit `d6067c18`: disposable native PostgreSQL acceptance run `40563950932` **passed**; the workflow now reacts to authorized shamble contract changes.
- Commit `130eed50`: release-candidate safe checks run `40565021792` **passed**.
- Commit `0ff5b348`: expanded release candidate synthetic-acceptance job **passed** in run `40565345836`; seven-width visual-matrix job was **still in progress when recorded**. This expanded job executes `tests/*.test.cjs` and `tests/acceptance/*.test.cjs`.
- **Do not treat any of the above as authenticated device or live-backend validation.** No disposable commissioner/captain identities or safe hosted write-test environment have been verified; the release gate remains blocked pending that evidence.

## Verified automated evidence

- Current development branch `development/nov20-release-reconciliation-20261026`: draft/scoring reconciliation checks passed at `b9d7386` (GitHub Actions run 40515850192); responsive synthetic browser acceptance passed at `07376887` (run 40511950148). These checks do **not** certify authenticated end-to-end use.
- Current release gate: no disposable authenticated test identities/draft have been verified; production data must not be used for write tests. Record this as **BLOCKED**, not passed, until isolation is confirmed.

- Isolated PR #4 workflow run 39777001700 at `cf80ae27`: scoring-regression and responsive-layout jobs succeeded.
- Synthetic Playwright capture covers 320, 375, 390, 430, 1024, 1440, 1920 CSS pixels. The workflow is designed for synthetic data and deliberately blocks writes to tournament records.
- This evidence does **not** validate authenticated production-equivalent scoring, commissioner/captain logins, database durability, or offline recovery.

## Required isolated acceptance environment

1. Verify preview URL maps to exactly the intended EllenG Cup commit in Vercel; never use a production URL for write tests.
2. Provision separate disposable tournament/draft records and test users in EllenG Supabase, with schema/RLS/RPC parity; if a separate backend cannot be isolated, **do not run write tests** on the live draft ID `elleng-cup`.
3. Never log or commit authentication sessions, passwords, personal scores, or service-role credentials. Only record sanitized run evidence.
4. Verify RLS, owner/captain mappings, client roles, and atomic conflict-detection RPCs exist in the isolated backend. Stop if any critical permission is wrong.

## Draft acceptance — target October 30

- [ ] Commissioner authenticated account can create and save setup; readback after reload matches.
- [ ] Non-commissioner cannot alter commissioner-only setup, timer, undo or reset; enforce on server.
- [ ] Two separate authenticated captain devices see one consistent pick sequence and clock.
- [ ] Simultaneous captain picks cannot overwrite or duplicate a golfer; stale writes reject and can retry safely.
- [ ] Standard and snake draft with two, four, and uneven team sizes; ABCD balancing or open rules verified for configured format.
- [ ] Pause, resume, reset timer, undo, reconnection, and refresh preserve the same saved state.
- [ ] Spectator receives realtime updates without gaining write privileges.
- [ ] Draft rehearsal completed on mobile and desktop using isolated data.

## Scoring acceptance — target October 30 (tournament November 20)

- [ ] Correct 9-hole scramble and 9-hole shamble/split-pair totals, ties, Gator Hole and Final Cargo under actual event rules.
- [ ] Concurrent entry from commissioner, captains and eligible players: reject lost updates and double submissions.
- [ ] Score readback succeeds after save before displaying saved confirmation; correct hole preserved after navigation.
- [ ] Disconnect/reconnect resumes unsent entries without duplicating accepted scores; distinguish queued from saved.
- [ ] Multiple devices agree on scores, standings and points after deliberate network disruption.
- [ ] Recovery from account refresh/sign-out mid-save does not leak data or corrupt scores.

## Operations and fallback

- [ ] Verify database backup availability and a restore rehearsal **to a separate database**, without overwriting active event records.
- [ ] Identify rollback deployment and ensure schema migrations are compatible with rollback.
- [ ] Confirm PWA cache/version update behavior before event, and freeze the validated release after October 30 readiness sign-off.
- [ ] Document commissioner contingency plan for paper/spreadsheet score entry and manual reconciliation.

## Evidence format

For each item, record: date, scenario, isolated backend/project (non-secret ID only), tested commit SHA, devices/browsers, expected/actual result, screenshots or sanitized traces, pass/fail, owner, and unresolved blockers.

**Release decision:** Synthetic CI success alone is insufficient. Do not merge or deploy until the applicable authenticated checks and backup/rollback evidence pass.

## October 27 read-only EllenG Supabase inspection

- Connected project: `xepccqedhbucpbwuykoc` (EllenG Cup connection only); project reported ACTIVE_HEALTHY.
- All 14 returned `public` tables have RLS enabled. This does **not** prove policies are correct or that each authenticated role is restricted properly.
- The existing `elleng_drafts` and `elleng_tournaments` tables each contain one record, and `elleng_captains` contains six records. Treat these as potentially live; do not modify or use them as disposable test fixtures.
- Read-only schema inspection confirmed draft `id`, `owner_id`, `state`, `status`, and captain `draft_id`, `user_id`, `team_index` fields.
- **Isolation gate remains blocked:** no separately verified disposable backend, test draft, or test authentication identities. Do not infer readiness from RLS-enabled flags or synthetic CI.
- Next acceptance step: verify an isolated backend/project and authenticated commissioner/captain test accounts, then run the existing checklist and capture sanitized evidence. Never write to the live `elleng-cup` draft.

## October 27 read-only draft RLS policy review

- `elleng_drafts` INSERT policies (`authenticated insert`, `elleng_owner_insert`) both require `auth.uid() = owner_id`; the UPDATE policy requires the same predicate in both USING and WITH CHECK.
- `elleng_captains` owner-management ALL policy requires the authenticated user to own the corresponding draft, in both USING and WITH CHECK. Captain SELECT policies allow their own assignment or the draft owner.
- `elleng_drafts` SELECT policy `authenticated can read draft` uses `true` for **all authenticated users**. Confirm this matches intended spectator/privacy rules; do not tighten it without testing legitimate read paths.
- This is a **static policy inspection**, not an authenticated role test. Policy interactions, RPC permissions, simultaneous picks, and real-device authorization remain unverified. No policies were modified.

## October 27 Supabase security advisor and draft RPC inspection

Read-only security advisor returned:
- WARN: authenticated users can execute three `SECURITY DEFINER` RPCs: `elleng_make_pick`, `elleng_auto_pick`, and `elleng_save_state_if_fresh`. These are intended draft operations, but elevated privileges demand authenticated negative-case tests. [Advisor remediation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- INFO: `elleng_golfer_pins` and `elleng_trash_talk_settings` have RLS enabled without policies; confirm they are intentionally inaccessible via ordinary client roles. [Advisor remediation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- WARN: leaked-password protection is disabled; evaluate enabling it after confirming plan support and impact. [Auth documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Read-only function definitions show:
- `elleng_make_pick` checks signed-in captain assignment, active team, draft pause, turn order, golfer availability, and band constraints; locks the draft row `FOR UPDATE` before modifying picks.
- `elleng_auto_pick` checks owner **or assigned captain**, paused status, and expired timer before auto-picking, and locks the draft row. **Acceptance decision:** confirm any captain may trigger an expired-timer auto-pick, not only the commissioner/current captain.
- `elleng_save_state_if_fresh` requires the draft owner and matching `updated_at`, rejecting stale commissioner saves.

Required authenticated negative-case tests on isolated fixtures: unrelated signed-in user calling each RPC; wrong-turn captain manual pick; captain auto-pick before deadline; captain attempting commissioner save; concurrent picks and stale save. Confirm elevated functions cannot be abused through unexpected inputs or helper functions.

**No production policies, functions, authentication settings, or records were changed.** Static inspection does not satisfy the real-device acceptance gate.

### Confirmed RPC EXECUTE grants (read-only catalog inspection)

For `elleng_auto_pick`, `elleng_make_pick`, and `elleng_save_state_if_fresh`, explicit `pg_proc.proacl` entries grant EXECUTE to `postgres`, `authenticated`, and `service_role`; no explicit `anon` or `PUBLIC` grant was present. These functions all use SECURITY DEFINER. The authenticated role can invoke them, so the in-function checks are essential. The absence of an explicit anon grant is not a substitute for a real anonymous-call test or an effective-permissions check. Verify `has_function_privilege` and negative cases in isolated acceptance before treating RPC exposure as cleared.

### October 27 effective RPC EXECUTE privilege check (read-only)

Queried `has_function_privilege` on the actual EllenG Supabase project for `elleng_make_pick`, `elleng_auto_pick`, and `elleng_save_state_if_fresh`. **All three:** `anon=false`, `authenticated=true`, `service_role=true`; all are `SECURITY DEFINER`. This verifies effective role-level grants (rather than only reading `proacl`). It does **not** establish that a signed-in unassigned user, wrong-turn captain, or non-owner is denied by the function body. Authenticated negative-case and concurrent-device tests remain **BLOCKED** pending verified disposable fixtures and accounts. No SQL writes were performed.

### October 27 read-only live function-body recheck

Re-fetched the actual database definitions for all three privileged draft RPCs (no writes):
- `elleng_make_pick` authenticates a mapped captain, locks the draft row `FOR UPDATE`, rejects paused, wrong-turn, invalid or already-drafted golfer picks, and persists the next timer deadline.
- `elleng_auto_pick` authenticates owner **or any assigned captain**, locks the draft row, and only changes state after a non-paused timer has expired. **Decision required:** is allowing a captain other than the active team to trigger a legitimately expired auto-pick intentional? No change made pending owner decision.
- `elleng_save_state_if_fresh` requires the draft owner and exact `updated_at` match, rejecting stale writes with SQLSTATE `40001`.

These are static function-body observations, not authenticated execution results. Do not mark cross-device or permission acceptance as passed.

## CRITICAL — October 27 scoring RLS permissive-policy bypass (release blocker)

**Read-only `pg_policies` audit of the actual EllenG Supabase project identified a potentially exploitable authorization bypass. Do not deploy or permit live scoring until fixed and authenticated negative-case tested.**

- `elleng_team_scores`, `elleng_player_hole_scores`, and `elleng_pair_hole_scores` each have separate `active live ... insert/update/delete guard` policies `TO authenticated` which check only the tournament status (`setup`/`live`) and team index range, **without checking `auth.uid()` or captain/commissioner ownership**.
- Separate `captain or commissioner ...`, `shamble_team_...`, and `pair_team_...` policies do enforce ownership, but PostgreSQL **permissive** RLS policies combine with OR by default. Therefore the active-live policies may authorize otherwise-unassigned authenticated users to INSERT, UPDATE, or DELETE score rows while the tournament is in setup/live status. This is a static policy analysis, not an exploit test.
- **Remediation proposal (NOT APPLIED):** review `pg_policies.permissive` and convert active-live guard policies to `AS RESTRICTIVE` (AND semantics), preserving team/commissioner policies as permissive, or combine status and ownership into one permission policy per operation. Verify table privileges, FK behavior, and score writer roles first. The existing player-hole policy is hard-coded to draft ID `elleng-cup`, requiring special care with disposable test drafts.
- **Acceptance tests:** unrelated signed-in account cannot insert/update/delete any score row; captain can edit only their team; commissioner can edit allowed teams; finalized/archived tournament is immutable; valid live scoring still works. Use disposable records and accounts, never the existing live tournament.
- **Decision:** Block production scoring release until the authorization flaw is fixed and validated. No production database changes were made during discovery.
