# Post-draft commissioner team transfers — design gate (NOT IMPLEMENTED)

Status: design only. This document does not authorize deployment, migration, or live roster changes.

## Purpose
Allow the commissioner to move one active noncaptain between Team Jarad and Team Carl, or atomically swap two active noncaptains, after the draft is completed. Never reset or rerun the draft.

## Existing behavior and risk
Legacy Players & Assignments editing changes golfer.team through a general draft-state save. That does not establish that the corresponding teams[].roster, picks, weighted-roster guard, account links, and shamble scoring stay consistent. Do not use this legacy control for a completed draft.

## Safety contract
- Commissioner-only server RPC, authenticated with auth.uid() matching elleng_drafts.owner_id; deny anon and other golfers.
- Existing two-team shamble, completed draft, active tournament, and exactly one source roster membership per active golfer.
- Before any recorded player, team, or pair scores; reject once scoring has started. A later scored-transfer workflow requires a separate policy.
- Captains cannot move or swap in v1.
- Require expected draft updated_at; lock tournament and draft rows in consistent order; reject stale writes.
- Atomic update of golfer.team and both teams[].roster arrays; preserve golfer_index, golfer identity, participation, accounts, all original picks and draft metadata, and all score records.
- For move, require source and destination differ and validate capacities; for swap, require two distinct noncaptains on opposite teams.
- No automatic balancing, handicap compensation, phantom scores, team score recalculation, or draft replay.
- Save an audit record (actor, timestamp, operation, golfer indexes, original and destination teams, draft revision) and provide a commissioner confirmation with both roster changes.
- Fail closed if the new RPC is unavailable. Never fall back to the general saveDraftState or direct client JSON rewrite.
- Refresh Players, Teams, My Score and leaderboard across authenticated devices after success; show clear error on failure.

## Required tests before implementation can ship
1. Disposable PostgreSQL fixture with 21, 22, 23, 24, and odd/even active player counts; both directions and swaps.
2. Preserve draft picks, golfer indexes, account links, names, bands, scoring rows, and other roster members.
3. Reject unauthorized, stale revision, same-team, captain, inactive golfer, duplicate roster index, nonexistent golfer, invalid team, score-already-present, and repeat operations.
4. Race tests for concurrent commissioner transfer and first score; no partial writes.
5. Browser tests on mobile 320px/390px and two authenticated devices: commissioner control, player visibility, roster counts, no home/teams layout regression.
6. Real authenticated Supabase/PostgREST tests without live tournament writes. Role simulation alone is insufficient.
7. Review trigger/RLS and existing scoring RPCs; capture rollback and deployment version; require explicit separate production approval.

## Release decision
No production edits for the November 20 tournament. Implement and validate on a separate development branch; keep the live tournament and scoring untouched until all gates pass.
