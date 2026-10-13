# EllenG Cup — isolated beta verification plan

Scope: EllenG Cup only. Never run against FairwayOS or a live Supabase project.

## Current source observations
- `index.html` redirects to `scoring.html?v=2.7.46`, while `scoring.html` reports v2.7.91.
- `service-worker.js` cache is v2.7.47. Confirm whether these differing identifiers affect updates before changing them.
- `common.js` supports snake/straight draft and uneven roster capacity.
- The repository's `supabase.sql` authorizes captains to update the entire draft state. Client-side eligibility is not a security boundary. Confirm deployed RPC and RLS before live draft testing.
- Older alternate scoring pages exist. Use the actual entry point and linked pages, not legacy copies.

## Required checks (read-only until test environment is isolated)
1. Confirm Vercel project and Supabase project IDs are exclusive to EllenG Cup.
2. Confirm runner labels and runner availability. Any new Actions job must target the MacBook self-hosted runner and never `ubuntu-latest`.
3. Verify production pages and source versions; preserve rollback references.
4. Test role boundaries: commissioner, captain, player, anonymous viewer.
5. Test simultaneous captain picks, turn ownership, band eligibility, timeout auto-pick, and undo in an isolated database.
6. Test score saving, refresh persistence, score edits, relative-to-par totals, Gator Hole multipliers and ties, and Final Cargo.
7. Check mobile navigation, touch controls, viewport clipping, and PWA cache update behavior.
8. Record failing tests, reproduce on the development branch, then fix one issue at a time.

## Safety gates
- Never run destructive tests against the live tournament database.
- Never edit `main`, live Vercel settings, or live Supabase without explicit approval.
- Keep any future GitHub Actions workflows restricted to the verified MacBook runner labels.
- Do not claim tests passed without actual job output.
