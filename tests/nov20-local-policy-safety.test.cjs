const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=path.join(__dirname,'scripts','nov20-final-policy-local-check.sh');
function run(url,enabled='1'){
 const env={PATH:process.env.PATH||'/usr/bin:/bin',ELLENG_ENABLE_FINAL_POLICY_DB_TESTS:enabled,ELLENG_FINAL_POLICY_DB_URL:url};
 return spawnSync('bash',[script],{encoding:'utf8',env,timeout:5000});
}
test('policy harness refuses execution without explicit opt-in',()=>{
 const r=run('postgresql://127.0.0.1/elleng_policy_test_safe','0');
 assert.equal(r.status,2);
 assert.match(r.stderr,/Explicit/);
});
for(const url of [
 'postgresql://db.production.supabase.co/elleng_policy_test_safe',
 'postgresql://localhost/postgres',
 'postgresql://localhost/elleng_live',
 'postgresql://localhost/elleng_policy_test_safe?sslmode=disable',
 'postgresql://user:pass@localhost/elleng_policy_test_safe',
 'postgresql://localhost/elleng_policy_test_safe#fragment'
]){
 test('policy harness rejects unsafe database URL: '+url,()=>{
  const r=run(url);
  assert.equal(r.status,2);
  assert.match(r.stderr,/Refusing|Missing URL|Only /);
 });
}
