const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=path.join(__dirname,'..','scripts','check-local-draft-db.cjs');
function check(url){
 const env={...process.env};
 if(url===null)delete env.ELLENG_TEST_DATABASE_URL;
 else env.ELLENG_TEST_DATABASE_URL=url;
 return spawnSync(process.execPath,[script],{env,encoding:'utf8'});
}
test('local disposable database URL is accepted without connecting',()=>{
 const r=check('postgresql://tester:example@127.0.0.1:5432/elleng_draft_test');
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/No connection or SQL was executed/);
});
test('production-looking and remote database URLs are rejected',()=>{
 for(const url of [
  'postgresql://tester:example@db.example.com:5432/elleng_draft_test',
  'postgresql://tester:example@localhost:5432/postgres',
  'postgresql://tester:example@localhost:5432/elleng_production',
  'https://localhost/elleng_test'
 ])assert.notEqual(check(url).status,0,url);
});
test('unset and malformed database URLs fail closed',()=>{
 assert.notEqual(check(null).status,0);
 assert.notEqual(check('not a url').status,0);
});
