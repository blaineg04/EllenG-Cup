// Readiness checks only: never connects to or modifies a database.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const review=fs.readFileSync(path.join(__dirname,'..','docs','draft-auto-pick-migration-review.md'),'utf8');
const plan=fs.readFileSync(path.join(__dirname,'..','docs','draft-auto-pick-alignment.md'),'utf8');

test('auto-pick migration remains explicitly gated on isolated verification',()=>{
 assert.match(review,/not approved, not deployed/i);
 assert.match(review,/explicit production approval/i);
 assert.match(plan,/separate disposable Supabase test project/i);
});

test('integration test plan protects critical draft invariants',()=>{
 for(const topic of ['FOR UPDATE','authenticated','expired','concurrent','paused','unauthorized']){
   assert.ok((review+'\n'+plan).toLowerCase().includes(topic.toLowerCase()),'Missing '+topic);
 }
});
