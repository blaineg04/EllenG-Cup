# Transfer RPC: verified trigger and grants integration gate

Read-only production catalog inspection, November 19, 2026. No production writes.

## Installed triggers

- `elleng_prevent_scored_draft_format_change`: BEFORE UPDATE OF state ON public.elleng_drafts, calls `elleng_prevent_scored_draft_format_change()`.
- `elleng_weighted_roster_guard`: BEFORE UPDATE OF state ON public.elleng_drafts, calls `elleng_guard_weighted_roster()`.
- `elleng_guard_scored_tournament_config`: BEFORE UPDATE OF team_count ON public.elleng_tournaments, calls `elleng_guard_scored_tournament_config()`.

The new operation must not disable, replace, or evade these triggers. A draft-state update will invoke both draft triggers; any narrow authorization of a post-draft roster delta needs a security-reviewed trigger-compatible implementation, not a broad bypass.

## Table-level grants

Both `anon` and `authenticated` have SELECT, INSERT, UPDATE, DELETE grants on `elleng_drafts`; both also have additional grants on `elleng_tournaments` including TRIGGER and TRUNCATE. **Table-level privileges are not proof of effective access**: RLS policies, role ownership, and other constraints must also be considered. Avoid altering existing grants during tournament operations.

## Minimum isolated database integration scenarios

1. Unauthenticated RPC call rejected.
2. Authenticated non-owner RPC call rejected.
3. Owner can swap two active noncaptains on opposite teams in setup with zero score rows; golfer.team and both rosters change atomically; picks, captain markers, and unrelated metadata remain byte-for-byte equivalent as JSON values.
4. Owner cannot move/swap captain, inactive golfer, nonexistent golfer, or same-team pair.
5. Reject if tournament is live, missing, or associated with a different draft.
6. Reject if any of player, pair, or team score tables has a row for the tournament.
7. Reject stale `updated_at`, including two concurrent attempts.
8. Reject an orphaned golfer.team, duplicate roster membership, or malformed roster entry.
9. Existing withdrawal/restore and scoring RPCs continue working after installation.
10. Concurrent scoring and transfer transactions cannot commit an invalid cross-table state; acquire advisory lock compatible with scoring before locking tournament and draft.
11. Draft triggers remain enabled and function correctly for unauthorized direct updates.
12. Explicitly verify completed draft state from authoritative persisted fields; a client-supplied boolean is not evidence.

## Release decision

Do not implement a SECURITY DEFINER RPC by merely setting a session flag or skipping the weighted roster guard. A caller-settable GUC would be a bypass risk. Require an isolated Postgres/Supabase fixture with the installed trigger functions and policies before proposing a production migration.

The existing November 20 tournament must remain unaffected.
