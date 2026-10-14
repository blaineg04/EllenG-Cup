# Automatic draft pick — migration review checklist

**Status: not approved, not deployed.** This is a development review artifact only.

## Proposed behavioral change

In the database function `public.elleng_auto_pick(text)`, select an unassigned golfer whose handicap-band penalty equals the minimum penalty among all unassigned, named, valid-band golfers for the current team. Use the existing `public.elleng_pick_balance_penalty(state,team,band)` calculation already used by manual `elleng_make_pick`. Retain the current deterministic candidate ordering unless separately reviewed.

## Non-negotiable invariants

1. Require an authenticated caller who is the authorized draft owner or captain.
2. Lock the draft row with `FOR UPDATE` before checking or mutating the state.
3. Do nothing unless the draft is active, unpaused, and its current deadline has expired.
4. Never select a blank, already-assigned, or invalid-band golfer.
5. Persist at most one pick for a turn and atomically advance the turn and deadline.
6. Keep existing return shape, grants, error handling, and function security attributes.
7. Do not modify scoring, course configuration, live tournament records, or other apps.

## Migration construction

Capture the full existing function definition, including its signature, grants, `SECURITY DEFINER`, and any `search_path` settings. Change **only** the eligibility candidate predicate and associated minimum-penalty calculation. Do not recreate the function from an abbreviated example. Store the complete reviewed SQL migration on the development branch and execute it only in a disposable test project before requesting approval for live deployment.

## Release evidence required

- A failing test for the old automatic function and a passing test for the candidate function on the same synthetic draft state.
- Equal manual and automatic eligible candidate sets across varied A/B/C/D distributions.
- Two concurrent expired-timer invocations persist exactly one pick.
- Authorization, pause, deadline, and completed-draft rejection tests pass.
- Reviewed SQL diff, rollback strategy, and explicit production approval.

**Current evidence:** the repository's JavaScript regression fixture demonstrates the rule mismatch; it is not a database integration test.
