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
