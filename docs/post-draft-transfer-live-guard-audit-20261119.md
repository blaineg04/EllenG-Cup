# Live database read-only guard audit — November 19, 2026

Project: EllenG Cup `xepccqedhbucpbwuykoc`. Inspected only `pg_proc` function definitions using SELECT. **No writes, migrations, or test scoring.**

## Verified live findings
- `public.elleng_guard_weighted_roster()` is SECURITY INVOKER and differs materially from the original weighted-draft install.sql.
- The live guard contains a special case for the `elleng-cup` draft that continues checking golfer changes after the draft is completed. It contains a narrowly scoped withdrawal/restore exception referencing `elleng_withdraw_golfer(...)` and requires `old.state->'teams'=new.state->'teams'`. A move or swap that changes team rosters **will not qualify for this exception**.
- The guard also contains a paused-reset exception for exactly two captain picks, no scores, no group assignments, and tournament status setup. This is not a post-draft move permission.
- The live scoring RPC `elleng_test_authorized_shamble(...)` is SECURITY DEFINER. It takes an advisory lock for the tournament, checks commissioner/captain authorization, and reads the authoritative roster from draft JSON. It supports integer roster entries and object entries with `golferIndex`. A roster transfer would therefore affect scoring authorization.
- Scoring RPC locks the tournament row `FOR UPDATE` and draft row `FOR SHARE`. A transfer must coordinate with this lock order and score gate; checking scores outside the lock is insufficient.
- The scoring RPC accepts NULL score to delete a score row, so the transfer gate must consider all score rows, not merely totals.

## Implications
Do **not** install a generic SECURITY DEFINER move RPC or directly update `elleng_drafts.state` under the current guard. A narrowly constrained, separately reviewed change to the live weighted guard is required to permit an atomic post-draft roster transfer. A generic trigger bypass would be unsafe. Any change must also preserve withdrawal/restore behavior.

The function output inspected here was truncated at 3,500 characters per function, so this is **not a complete review** of either definition. Retrieve full definitions before authoring executable SQL. Review RLS and actual table schema separately.

Status: investigation only. No production change authorized.
