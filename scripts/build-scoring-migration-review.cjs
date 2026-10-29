'use strict';
// Compile one REVIEW-ONLY transaction from the checked-in scoring proposals.
// Never run generated SQL against hosted Supabase before approval and tests.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function read(p){return fs.readFileSync(path.join(root,p),'utf8');}
const parts=[
 'db/patches/20261028_split_pair_team_total_range_REVIEW_ONLY.sql',
 'db/patches/20261028_team_score_format_trigger_REVIEW_ONLY.sql',
 'db/patches/20261028_tournament_config_score_guard_REVIEW_ONLY.sql',
 'db/patches/20261028_shamble_dynamic_draft_policies_REVIEW_ONLY.sql',
 'db/patches/20261028_split_pair_atomic_rpc_REVIEW_ONLY.sql',
 'tests/acceptance/authorized-shamble-rpc-proposal.sql'
];
const sections=parts.map(p=>{
 let s=read(p).replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,'');
 return '-- SOURCE: '+p+'\n'+s;
});
const sql=[
 '-- REVIEW ONLY. NOT APPROVED FOR LIVE INSTALLATION.',
 '-- This is a candidate for disposable PostgreSQL validation, NOT a release artifact.',
 '-- Blocked by existing direct score table DML and incomplete SECURITY DEFINER review.',
 'BEGIN;',
 ...sections,
 // Installation statements are included for review and compatibility inspection.
 'CREATE TRIGGER elleng_enforce_team_score_format BEFORE INSERT OR UPDATE ON public.elleng_team_scores FOR EACH ROW EXECUTE FUNCTION public.elleng_enforce_team_score_format();',
 'CREATE TRIGGER elleng_prevent_scored_draft_format_change BEFORE UPDATE OF state ON public.elleng_drafts FOR EACH ROW EXECUTE FUNCTION public.elleng_prevent_scored_draft_format_change();',
 'CREATE TRIGGER elleng_guard_scored_tournament_config BEFORE UPDATE OF team_count ON public.elleng_tournaments FOR EACH ROW EXECUTE FUNCTION public.elleng_guard_scored_tournament_config();',
 'REVOKE ALL ON FUNCTION public.elleng_test_authorized_shamble(text,integer,integer,integer,integer) FROM PUBLIC, anon;',
 'GRANT EXECUTE ON FUNCTION public.elleng_test_authorized_shamble(text,integer,integer,integer,integer) TO authenticated;',
 // Explicit stop prevents accidental application even if someone pastes output.
 "DO $block$ BEGIN RAISE EXCEPTION 'REVIEW-ONLY scoring candidate: direct-DML permissions and trigger owner must be reconciled before deployment'; END $block$;",
 'COMMIT;'
].join('\n\n');
if(process.argv.includes('--stdout'))process.stdout.write(sql+'\n');
else {process.stderr.write('Review only. Run with --stdout to inspect; final SQL deliberately aborts.\n');process.exitCode=2;}
