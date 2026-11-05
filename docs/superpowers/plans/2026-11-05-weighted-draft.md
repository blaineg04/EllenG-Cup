# Weighted Draft Implementation Plan

Goal: reusable two-team strength/depth balancing with captain seeding and server/client parity.
Architecture: pure JS and SQL allocation engines; opt-in versioned draft mode; existing authenticated pick RPCs retain turn, pause, ownership and concurrency protections.
Tech stack: vanilla JavaScript, Node test runner, PostgreSQL PL/pgSQL.
Spec: docs/superpowers/specs/2026-11-05-weighted-draft-design.md

## Constraints and review focus
No production writes. No inferred ranks. Existing noncaptain picks cannot be converted. Excluded golfers never affect totals. Odd roster sizes compare per-place strength; unequal team scoring remains a separate limitation. Two-team scope matches the current EllenG tournament; other team counts retain legacy rules.

## Tasks
- [x] 1. Write failing independent enumeration tests for one/many/no As, unequal captain ranks, sparse pools, nonplayers, missing ranks, odd totals and all reachable picks. Implement weighted-draft.js and pure preparation. Run node --test tests/weighted-draft.test.cjs.
- [x] 2. Integrate module and opt-in mode in common/admin/captain/viewer; add SQL engine and manual/timeout enforcement release candidate. Verify seeded captains, paused conversion and JS/SQL parity in disposable database.
- [ ] 3. Run the repository Node suite, review changes, push isolated branch and open a PR. Leave production and current draft state unchanged.

Review: independent reviewer found suppressed post-write refreshes and removable captain seeds. Both reproduced RED, fixed and verified GREEN. Added server-side protection against legacy commissioner saves bypassing weighted picks.
Ruling: weights 5/3/2/1 deliberately emphasize A strength; they approximate bands rather than handicaps. Odd counts normalize by roster size and cannot remove unequal-player scoring advantage. Current feature targets two-team EllenG; legacy multi-team drafts are preserved.
