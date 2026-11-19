# Live draft completion compatibility finding (read-only, 2026-11-19)

**Release blocker — do not deploy isolated RPCs.**

Read-only inspection of public.elleng_drafts joined to public.elleng_tournaments for elleng-cup / elleng-cup-live found:
- draft.status = setup, tournament.status = setup
- draftRules = weighted
- 23 picks
- 23 originally assigned golfers excluding late_added, 19 currently participating
- 70 golfer slots (not 70 participants)

The isolated check_transfer_gate() currently requires draft.status = completed.
That assumption does **not** match the live draft. The real weighted-roster guard instead checks picks.length >= count of originally assigned non-late-added golfers. Do not use current isolated status check in a production migration.

Required before release:
1. Replace the isolated completion predicate with a server-verified draft-completion rule consistent with the actual weighted guard, accounting for withdrawals and late additions.
2. Build fixtures with setup-status drafts and 23 picks / 23 original assignments / fewer current participants; reject incomplete drafts.
3. Confirm the current production trigger's completed-draft protection remains intact and transfer authorization cannot be invoked through a direct table update.
4. Implement a narrowly authorized transfer-only path, verify all scoring and concurrent updates, then request explicit deployment approval.

This note records schema observations only. No production writes were performed.
