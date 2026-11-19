# Weighted-roster trigger assessment for team transfers

Read-only source inspection on 2026-11-19 of `db/releases/weighted-draft/install.sql` and `supabase/migrations/20261112000001_allow_roster_edits_after_reset.sql` search results.

The staged weighted-draft guard checks `draftRules='weighted'`, counts playing golfers, and returns NEW when `picks.length >= playing_count`. Before completion it compares names, bands, and self-ranked fields, not the team assignment fields. **This does not establish production behavior**: the documented production drift says the installed guard differs from the tested release.

Important implication: do not assume a guard exception is required or safe. A new RPC must not bypass any trigger without a precise read-only check of the deployed definition and disposable PostgreSQL tests. Preserve existing protections.

Additional release blocker: `picks.length >= playing_count` is not a universal completed-draft signal for a late-added golfer (for example 23 picks with 24 playing golfers). A new transfer RPC must validate the actual completed-draft marker/phase and team membership instead of assuming this count proves completion.

No SQL migration is introduced by this assessment. No production database operations were performed.
