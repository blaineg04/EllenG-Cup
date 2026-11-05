# Player Participation Implementation Plan

Goal: choose tournament participation without deleting accounts.
Architecture: existing participating flag, explicit add-form default, atomic commissioner status RPC using tournament then draft locks and timestamp guard. Existing online scoring remains unchanged.
Tech Stack: HTML/JavaScript, PostgreSQL, Node tests.
Spec: ../specs/2026-11-05-player-participation-design.md

Global constraints: EllenG only; no live roster/account/score writes; preview before release; preserve indices, photos and accounts.
Review focus: stale devices; account-only promotion; accidental team assignment; draft already started; partial save/read failure.

- [ ] Write failing tests for creation default and status save behavior.
- [ ] Implement explicit selector and existing-card status control, defaulting to Not playing and clearing team for excluded golfers.
- [ ] Implement commissioner-only scoped atomic RPC with stale timestamp and tournament/picks/assignment/score guards, preserving all unrelated JSON and account rows.
- [ ] Test synthetic creation, toggle, preservation, protection, and browser integration; run relevant existing regressions.
- [ ] Save separate draft PR; obtain independent review and verified preview before production.
