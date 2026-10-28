const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const script=path.join(__dirname,'isolated-auth-scoring-preflight.cjs');
const baseline={
 ELLENG_TEST_SUPABASE_KEY:'sb_publishable_test_only',
 ELLENG_TEST_CAPTAIN_EMAIL:'captain@example.invalid',
 ELLENG_TEST_CAPTAIN_PASSWORD:'dummy',
 ELLENG_TEST_SECOND_EMAIL:'second@example.invalid',
 ELLENG_TEST_SECOND_PASSWORD:'dummy'
};
function run(config){
 const env={...process.env,...baseline,...config};
 for(const name of Object.keys(env))if(name.startsWith('ELLENG_TEST_')&&!(name in baseline)&&name!=='ELLENG_TEST_SUPABASE_URL')delete env[name];
 const result=spawnSync(process.execPath,[script],{env,encoding:'utf8',timeout:5000});
 return {code:result.status,text:(result.stderr||'')+(result.stdout||'')};
}
test('live EllenG Supabase is refused before authentication',()=>{
 const r=run({ELLENG_TEST_SUPABASE_URL:'https://xepccqedhbucpbwuykoc.supabase.co/'});
 assert.notEqual(r.code,0);assert.match(r.text,/Refusing non-isolated or invalid Supabase integration host/);
});
test('invalid and credential-bearing hosts are refused before authentication',()=>{
 for(const url of ['http://test.supabase.co/','https://user:pass@test.supabase.co/','https://example.com/','https://test.supabase.co/other']){
  const r=run({ELLENG_TEST_SUPABASE_URL:url});
  assert.notEqual(r.code,0,url);
  assert.match(r.text,/Refusing non-isolated or invalid Supabase integration host/,url);
 }
});
test('missing configuration fails without contacting any server',()=>{
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('ELLENG_TEST_'))delete env[key];
 const r=spawnSync(process.execPath,[script],{env,encoding:'utf8',timeout:5000});
 assert.notEqual(r.status,0);assert.match(r.stderr,/Isolated integration environment not configured/);
});
