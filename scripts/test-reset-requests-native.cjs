'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync,spawn}=require('node:child_process');
if(process.platform!=='darwin')throw Error('Use authorized Mac native PostgreSQL runner');
const bin='/Applications/Postgres.app/Contents/Versions/18/bin',root=fs.mkdtempSync('/tmp/elleng-reset-request-test-');fs.chmodSync(root,0o700);
const data=path.join(root,'data'),socket=path.join(root,'socket');fs.mkdirSync(socket,{mode:0o700});
const env={...process.env,PGHOST:socket,PGPORT:'55443',PGUSER:'postgres',PGDATABASE:'postgres',PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'10'};
for(const key of ['PGPASSWORD','PGPASSFILE','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGHOSTADDR'])delete env[key];
function run(tool,args,input,mayFail=false){const r=spawnSync(path.join(bin,tool),args,{env,input,encoding:'utf8'});if(!mayFail&&r.status!==0)throw Error(tool+' failed: '+r.stderr);return r}
function sql(q,mayFail=false){return run('psql',['-X','-v','ON_ERROR_STOP=1','-At'],q,mayFail)}
const val=q=>sql(q).stdout.trim().split('\n').pop();
const reject=q=>assert.notEqual(sql(q,true).status,0,'Operation should be denied');
function concurrent(q){return new Promise((resolve,reject)=>{const p=spawn(path.join(bin,'psql'),['-X','-v','ON_ERROR_STOP=1','-At'],{env});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',c=>c===0?resolve(out):reject(Error(err)));p.stdin.end(q)})}
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',H='a'.repeat(64),J='b'.repeat(64);
let started=false;
(async()=>{try{
 run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale']);
 run('pg_ctl',['-D',data,'-l',path.join(root,'server.log'),'-o',`-k ${socket} -p 55443 -c listen_addresses=''`,'-w','start']);started=true;
 sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key);INSERT INTO auth.users VALUES('${A}'),('${B}');CREATE TABLE public.elleng_player_accounts(draft_id text,user_id uuid);INSERT INTO elleng_player_accounts VALUES('elleng-cup','${A}'),('elleng-cup','${B}');GRANT SELECT ON elleng_player_accounts TO service_role;`);
 sql(fs.readFileSync('db/releases/account-recovery/install.sql','utf8'));
 for(const role of ['anon','authenticated']){
  reject(`SET ROLE ${role};SELECT * FROM elleng_recovery_emails;`);
  reject(`SET ROLE ${role};INSERT INTO elleng_recovery_emails(user_id,verified_email) VALUES('${A}','evil@example.com');`);
  reject(`SET ROLE ${role};SELECT elleng_recovery_pending('${A}','evil@example.com','${H}');`);
  reject(`SET ROLE ${role};SELECT elleng_recovery_confirm('${H}');`);
  reject(`SET ROLE ${role};SELECT elleng_recovery_gate('${H}',5,60);`);
 }
 sql(`SET ROLE service_role;SELECT elleng_recovery_pending('${A}','one@example.com','${H}');`);
 assert.equal(val(`SET ROLE service_role;SELECT elleng_recovery_confirm('${H}');`),'t');
 assert.equal(val(`SET ROLE service_role;SELECT elleng_recovery_confirm('${H}');`),'f','Token replay must fail');
 sql(`SET ROLE service_role;SELECT elleng_recovery_pending('${A}','two@example.com','${J}');`);
 assert.equal(val(`SELECT verified_email FROM elleng_recovery_emails WHERE user_id='${A}'`),'one@example.com','Pending replacement preserves verified address');
 sql(`UPDATE elleng_recovery_emails SET pending_expires_at=now()-interval '1 minute';`);
 assert.equal(val(`SET ROLE service_role;SELECT elleng_recovery_confirm('${J}');`),'f','Expired confirmation must fail');
 sql(`SET ROLE service_role;SELECT elleng_recovery_pending('${A}','two@example.com','${J}');`);
 const results=await Promise.all([concurrent(`SET ROLE service_role;SELECT elleng_recovery_confirm('${J}');`),concurrent(`SET ROLE service_role;SELECT elleng_recovery_confirm('${J}');`)]);
 assert.equal(results.filter(x=>x.trim().split('\n').pop()==='t').length,1,'Concurrent confirmation succeeds once');
 sql(`SET ROLE service_role;SELECT elleng_recovery_pending('${B}','two@example.com','${H}');`);
 assert.equal(val(`SET ROLE service_role;SELECT elleng_recovery_confirm('${H}');`),'f','Verified address cannot attach to two accounts');
 sql(`SET ROLE service_role;SELECT elleng_recovery_pending('${B}','three@example.com','${H}');`);
 sql(`DELETE FROM elleng_player_accounts WHERE user_id='${B}';`);
 assert.equal(val(`SET ROLE service_role;SELECT elleng_recovery_confirm('${H}');`),'f','Unlinked account cannot confirm');
 const limits=await Promise.all(Array.from({length:12},()=>concurrent(`SET ROLE service_role;SELECT elleng_recovery_gate('${H}',5,3600);`)));
 assert.equal(limits.filter(x=>x.trim().split('\n').pop()==='t').length,5,'Concurrent requests cannot exceed cap');
 assert.equal(val('SELECT attempts FROM elleng_recovery_limits'), '5');
 sql("UPDATE elleng_recovery_limits SET expires_at=now()-interval '1 second';");
 assert.equal(val(`SET ROLE service_role;SELECT elleng_recovery_gate('${H}',5,3600);`),'t');
 assert.equal(val('SELECT attempts FROM elleng_recovery_limits'),'1');

 sql("ALTER TABLE elleng_player_accounts ADD COLUMN username text;UPDATE elleng_player_accounts SET username='bburt';CREATE TABLE elleng_drafts(id text primary key,owner_id uuid);INSERT INTO elleng_drafts VALUES('elleng-cup','"+A+"');GRANT SELECT ON elleng_drafts TO service_role;");
 sql(fs.readFileSync('db/releases/reset-requests/install.sql','utf8'));
 for(const role of ['anon','authenticated']){
  for(const table of ['elleng_reset_requests','elleng_reset_push_keys','elleng_reset_push_devices'])reject('SET ROLE '+role+';SELECT * FROM '+table+';');
  reject(`SET ROLE ${role};SELECT elleng_queue_reset_request('${A}','bburt');`);
  reject(`SET ROLE ${role};SELECT elleng_claim_reset_request('00000000-0000-4000-8000-000000000000');`);
 }
 const submits=await Promise.all(Array.from({length:10},()=>concurrent(`SET ROLE service_role;SELECT elleng_queue_reset_request('${A}','bburt');`)));
 const submitted=submits.map(x=>JSON.parse(x.trim().split('\n').pop()));assert.equal(submitted.filter(x=>x.fresh).length,1);const requestId=submitted[0].id;assert(submitted.every(x=>x.id===requestId));
 assert.equal(val('SELECT count(*) FROM elleng_reset_requests'),'1');
 assert.equal(val(`SET ROLE service_role;SELECT coalesce(elleng_queue_reset_request('${B}','not-linked'),'null'::jsonb);`),'null','Unlinked target rejected');
 const claims=await Promise.all([concurrent(`SET ROLE service_role;SELECT elleng_claim_reset_request('${requestId}');`),concurrent(`SET ROLE service_role;SELECT elleng_claim_reset_request('${requestId}');`)]);
 assert.equal(claims.filter(x=>x.trim().split('\n').pop()!=='SET').length,1,'Concurrent reset claim succeeds once');
 sql("UPDATE elleng_reset_requests SET claimed_at=now()-interval '6 minutes';");assert(val(`SET ROLE service_role;SELECT elleng_claim_reset_request('${requestId}');`).includes('claim_token'),'Expired claim can be retried');
 sql("UPDATE elleng_reset_requests SET status='resolved',closed_at=now();");assert(JSON.parse(val(`SET ROLE service_role;SELECT elleng_queue_reset_request('${A}','bburt');`)).fresh,'Later request allowed after completion');
 for(let i=0;i<10;i++)sql(`SET ROLE service_role;SELECT elleng_save_reset_push_device('${A}','{"endpoint":"https://web.push.apple.com/fixture-${i}","keys":{}}'::jsonb);`);
 reject(`SET ROLE service_role;SELECT elleng_save_reset_push_device('${A}','{"endpoint":"https://web.push.apple.com/overflow","keys":{}}'::jsonb);`);
 reject(`SET ROLE service_role;SELECT elleng_save_reset_push_device('${B}','{"endpoint":"https://web.push.apple.com/wrong-owner","keys":{}}'::jsonb);`);
 console.log('PASS: reset queue and push-key privacy, owner device enrollment cap, unlinked rejection, concurrent request deduplication, exclusive reset claims and expired claim recovery');
 console.log('PASS: private recovery tables/RPCs, expired/replayed/concurrent confirmation, verified-address uniqueness, linked-user check, concurrent rate cap, expiry reset');
}finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop'],undefined,true);fs.rmSync(root,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
