# EllenG Cup — app-only release candidate hold point
Created: 2026-10-22
Source verified development SHA: `89d0e223c46cd93bb62a821fd2c07e7f8af4b4cf`.

**Release state: HOLD — NOT approved for merge/deployment.**

This candidate is a pinned copy of the development branch, including tests, workflows, reference SQL and a **proposed** migration. It is *not* a pruned app-only artifact. Vercel static source deploys will not automatically execute SQL in `docs/` or `supabase.sql`, but this must be verified in the deployment configuration before release.

**Runtime files to approve for app-only rollout:** `admin.html`, `captain.html`, `common.js`, `draft.html`, `scoring.html`, `style.css`, together with their inherited release dependencies.

**Do not run:** `supabase.sql`, `docs/proposed-realtime-publication-migration.sql`, any Docker restore/backup workflow, or any test scripts against hosted production.

**Must pass before live merge:** exact combined release diff review against `main`; isolated authenticated two-device rehearsal; authorized score and captain end-to-end flows; Realtime publication review; rollback validation; and explicit release approval. Production baseline `dpl_FbiibvrkEcsYBvT6EojMxxrtNwYs` at `27efe937`.

No production records or FairwayOS resources should be modified.
