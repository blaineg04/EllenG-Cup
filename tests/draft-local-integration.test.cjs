// Optional integration harness. Skips unless explicitly enabled.
// Never uses a production Supabase connection string.
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {URL}=require('node:url');
const enabled=process.env.ELLENG_RUN_LOCAL_DB_TESTS==='1';
test('local PostgreSQL draft functions have expected signatures', {skip:!enabled},()=>{
 const raw=process.env.ELLENG_TEST_DATABASE_URL;
 assert.ok(raw,'ELLENG_TEST_DATABASE_URL required');
 const preflight=spawnSync(process.execPath,[path.join(__dirname,'..','scripts','check-local-draft-db.cjs')],{env:process.env,encoding:'utf8'});
 assert.equal(preflight.status,0,preflight.stderr);
 const u=new URL(raw);
 assert.ok(['127.0.0.1','localhost','[::1]','::1'].includes(u.hostname));
 const sql="SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND ((p.proname='elleng_auto_pick' AND pg_get_function_identity_arguments(p.oid)='p_draft_id text') OR (p.proname='elleng_make_pick' AND pg_get_function_identity_arguments(p.oid)='p_draft_id text, p_golfer_index integer') OR (p.proname='elleng_pick_balance_penalty' AND pg_get_function_identity_arguments(p.oid)='p_state jsonb, p_team integer, p_band text'))";
 const result=spawnSync('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8',timeout:15000,env:{...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGCONNECT_TIMEOUT:'5'}});
 assert.equal(result.status,0,result.stderr||result.error?.message);
 assert.equal(result.stdout.trim(),'3','Expected three draft functions in disposable local database');
});
