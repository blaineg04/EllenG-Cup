# EllenG Cup — November 13 draft and November 20 scoring acceptance gate

Updated: 2026-10-22. This is a checklist of **unverified live evidence**, not an assertion that the tournament is ready.

## Verified automated evidence

- Isolated PR #4 workflow run 39777001700 at `cf80ae27`: scoring-regression and responsive-layout jobs succeeded.
- Synthetic Playwright capture covers 320, 375, 390, 430, 1024, 1440, 1920 CSS pixels. The workflow is designed for synthetic data and deliberately blocks writes to tournament records.
- This evidence does **not** validate authenticated production-equivalent scoring, commissioner/captain logins, database durability, or offline recovery.

## Required isolated acceptance environment

1. Verify preview URL maps to exactly the intended EllenG Cup commit in Vercel; never use a production URL for write tests.
2. Provision separate disposable tournament/draft records and test users in EllenG Supabase, with schema/RLS/RPC parity; if a separate backend cannot be isolated, **do not run write tests** on the live draft ID `elleng-cup`.
3. Never log or commit authentication sessions, passwords, personal scores, or service-role credentials. Only record sanitized run evidence.
4. Verify RLS, owner/captain mappings, client roles, and atomic conflict-detection RPCs exist in the isolated backend. Stop if any critical permission is wrong.

## Draft acceptance — deadline November 13

- [ ] Commissioner authenticated account can create and save setup; readback after reload matches.
- [ ] Non-commissioner cannot alter commissioner-only setup, timer, undo or reset; enforce on server.
- [ ] Two separate authenticated captain devices see one consistent pick sequence and clock.
- [ ] Simultaneous captain picks cannot overwrite or duplicate a golfer; stale writes reject and can retry safely.
- [ ] Standard and snake draft with two, four, and uneven team sizes; ABCD balancing or open rules verified for configured format.
- [ ] Pause, resume, reset timer, undo, reconnection, and refresh preserve the same saved state.
- [ ] Spectator receives realtime updates without gaining write privileges.
- [ ] Draft rehearsal completed on mobile and desktop using isolated data.

## Scoring acceptance — deadline November 20

- [ ] Correct 9-hole scramble and 9-hole shamble/split-pair totals, ties, Gator Hole and Final Cargo under actual event rules.
- [ ] Concurrent entry from commissioner, captains and eligible players: reject lost updates and double submissions.
- [ ] Score readback succeeds after save before displaying saved confirmation; correct hole preserved after navigation.
- [ ] Disconnect/reconnect resumes unsent entries without duplicating accepted scores; distinguish queued from saved.
- [ ] Multiple devices agree on scores, standings and points after deliberate network disruption.
- [ ] Recovery from account refresh/sign-out mid-save does not leak data or corrupt scores.

## Operations and fallback

- [ ] Verify database backup availability and a restore rehearsal **to a separate database**, without overwriting active event records.
- [ ] Identify rollback deployment and ensure schema migrations are compatible with rollback.
- [ ] Confirm PWA cache/version update behavior before event, and freeze release by November 13.
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
