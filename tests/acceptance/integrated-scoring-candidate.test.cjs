'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const script=path.resolve(__dirname,'../../scripts/build-scoring-migration-review.cjs');
test('integrated scoring candidate is explicitly nondeployable until database bypass closure',()=>{
 const r=spawnSync(process.execPath,[script,'--stdout'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
 const s=r.stdout;
 assert.match(s,/^BEGIN;/m);
 assert.match(s,/^COMMIT;/m);
 assert.match(s,/elleng_test_authorized_shamble/);
 assert.match(s,/elleng_test_authorized_scramble/);
 assert.match(s,/elleng_test_commissioner_clear_scores/);
 assert.match(s,/elleng_test_authorized_split_pair/);
 assert.match(s,/elleng_enforce_team_score_format/);
 assert.match(s,/elleng_prevent_scored_draft_format_change/);
 for(const table of ['elleng_team_scores','elleng_pair_hole_scores','elleng_player_hole_scores']){
  assert.ok(s.includes('BEFORE INSERT OR UPDATE ON public.'+table+' FOR EACH ROW EXECUTE FUNCTION public.elleng_lock_parent_for_score_write();'),table+' must lock parent');
 }
 assert.match(s,/shamble_team_insert/);
 assert.match(s,/REVIEW-ONLY scoring candidate: direct-DML permissions/);
 assert.equal((s.match(/^BEGIN;$/gm)||[]).length,1);
 assert.equal((s.match(/^COMMIT;$/gm)||[]).length,1);
});
test('candidate generator refuses implicit deployment output',()=>{
 const r=spawnSync(process.execPath,[script],{encoding:'utf8'});
 assert.notEqual(r.status,0);
 assert.equal(r.stdout,'');
});

test('production release SQL cannot be emitted before approval',()=>{
 const r=spawnSync(process.execPath,[script,'--release'],{encoding:'utf8'});
 assert.notEqual(r.status,0);
 assert.equal(r.stdout,'');
 assert.match(r.stderr,/NO-GO: release build disabled/);
});
