'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync,spawn}=require('node:child_process');
if(process.platform!=='darwin')throw Error('Use the authorized MacBook native PostgreSQL runner');
const bin='/Applications/Postgres.app/Contents/Versions/18/bin';
const root=fs.mkdtempSync('/tmp/elleng-player-test-');fs.chmodSync(root,0o700);
const data=path.join(root,'data'),socket=path.join(root,'socket');fs.mkdirSync(socket,{mode:0o700});
const env={...process.env,PGHOST:socket,PGPORT:'55441',PGUSER:'postgres',PGDATABASE:'postgres',PGSSLMODE:'disable',PGCONNECT_TIMEOUT:'10'};
for(const key of ['PGPASSWORD','PGPASSFILE','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGHOSTADDR'])delete env[key];
function run(tool,args,input,mayFail=false){const r=spawnSync(path.join(bin,tool),args,{env,input,encoding:'utf8'});if(!mayFail&&r.status!==0)throw Error(tool+' failed: '+r.stderr);return r}
function sql(q,mayFail=false){return run('psql',['-X','-v','ON_ERROR_STOP=1','-At'],q,mayFail)}
function file(p){sql(fs.readFileSync(p,'utf8'))}
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const own=(user,expr)=>`SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub','${user}',false);${expr}`;
const call=(event,hole,score)=>`SELECT public.elleng_save_own_score_atomic('player-test-${event==='split'?'split_pair':'standard'}','player-${event}',${hole},${score===null?'NULL':score});`;
function invoke(user,event,hole,score){return sql(own(user,call(event,hole,score)))}
function reject(q){assert.notEqual(sql(q,true).status,0,'Invalid operation unexpectedly succeeded')}
function value(q){return sql(q).stdout.trim()}
function asyncSql(q){return new Promise((resolve,reject)=>{const child=spawn(path.join(bin,'psql'),['-X','-v','ON_ERROR_STOP=1','-At'],{env});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('close',code=>code===0?resolve(out):reject(Error(err)));child.stdin.end(q)})}
let started=false;
(async()=>{try{
 run('initdb',['-D',data,'-U','postgres','-A','trust','--no-locale']);
 run('pg_ctl',['-D',data,'-l',path.join(root,'server.log'),'-o',`-k ${socket} -p 55441 -c listen_addresses=''`,'-w','start']);started=true;
 file('tests/acceptance/disposable-integrated-migration-schema.sql');
 file('tests/acceptance/player-score-base-install.sql');
 file('tests/acceptance/player-score-seed.sql');
 file('db/releases/player-score-atomic/install.sql');
 invoke(A,'standard',1,4);assert.equal(value("SELECT score FROM elleng_player_hole_scores WHERE tournament_id='player-standard' AND golfer_index=0"),'4');
 assert.equal(value("SELECT count(*) FROM elleng_team_scores WHERE tournament_id='player-standard'"),'0');
 invoke(A,'standard',1,null);assert.equal(value("SELECT count(*) FROM elleng_player_hole_scores WHERE tournament_id='player-standard'"),'0');
 for(let h=1;h<=18;h++)invoke(A,'standard',h,4);
 assert.equal(value("SELECT count(*) FROM elleng_player_hole_scores WHERE tournament_id='player-standard' AND golfer_index=0 AND score=4"),'18');
 assert.equal(value("SELECT count(*) FROM elleng_team_scores WHERE tournament_id='player-standard'"),'0');
 for(let h=1;h<=18;h++)invoke(A,'standard',h,null);
 invoke(A,'split',1,18);assert.equal(value("SELECT count(*) FROM elleng_team_scores WHERE tournament_id='player-split'"),'0');
 invoke(B,'split',1,19);assert.equal(value("SELECT score FROM elleng_team_scores WHERE tournament_id='player-split' AND hole=1"),'37');
 invoke(A,'split',1,null);assert.equal(value("SELECT count(*) FROM elleng_team_scores WHERE tournament_id='player-split' AND hole=1"),'0');
 reject(own(A,call('split',1,21)));reject(own(A,call('split',19,4)));
 reject(own('99999999-9999-4999-8999-999999999999',call('split',1,4)));
 reject("SET ROLE anon;"+call('split',1,4));reject("SET ROLE authenticated;"+call('split',1,4));
 reject(own(A,"SELECT public.elleng_save_own_score_atomic('player-test-standard','player-split',1,4);"));
 reject(own(A,"SELECT elleng_test_authorized_split_pair('player-split',0,1,0,4);"));
 reject(own(A,"SELECT elleng_test_authorized_scramble('player-standard',0,1,4);"));
 reject(own(A,"SELECT elleng_test_authorized_shamble('player-standard',0,10,0,4);"));
 for(const roster of ['[0,0,2,3]','[0,"bad",2,3]','[0,1,2]']){
  sql(`UPDATE elleng_drafts SET state=jsonb_set(state,'{teams,0,roster}','${roster}'::jsonb) WHERE id='player-test-split_pair';`);
  reject(own(A,call('split',2,4)));
  sql("UPDATE elleng_drafts SET state=jsonb_set(state,'{teams,0,roster}','[0,1,2,3]'::jsonb) WHERE id='player-test-split_pair';");
 }
 reject(own(A,"INSERT INTO elleng_pair_hole_scores(tournament_id,team_index,hole,pair_index,score) VALUES('player-split',1,1,0,2);"));
 sql("UPDATE elleng_tournaments SET status='archived' WHERE id='player-split';");reject(own(A,call('split',1,4)));sql("UPDATE elleng_tournaments SET status='setup' WHERE id='player-split';");
 sql("UPDATE elleng_player_accounts SET golfer_index=99 WHERE user_id='"+A+"' AND draft_id='player-test-standard';");reject(own(A,call('standard',1,4)));sql("UPDATE elleng_player_accounts SET golfer_index=0 WHERE user_id='"+A+"' AND draft_id='player-test-standard';");
 sql("CREATE FUNCTION synthetic_fail_total() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.hole=4 THEN RAISE EXCEPTION 'synthetic derived total failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER synthetic_fail_total BEFORE INSERT OR UPDATE ON elleng_team_scores FOR EACH ROW EXECUTE FUNCTION synthetic_fail_total();");
 invoke(A,'split',4,18);reject(own(B,call('split',4,19)));
 assert.equal(value("SELECT count(*) FROM elleng_pair_hole_scores WHERE tournament_id='player-split' AND hole=4 AND pair_index=1"),'0','Failed total must roll back the pair');
 sql('DROP TRIGGER synthetic_fail_total ON elleng_team_scores;DROP FUNCTION synthetic_fail_total();');
 for(let hole=5;hole<=9;hole++){
  const first=asyncSql('BEGIN;'+own(A,call('split',hole,18))+'SELECT pg_sleep(0.15);COMMIT;');
  const second=asyncSql(own(B,call('split',hole,19)));await Promise.all([first,second]);
  assert.equal(value(`SELECT score FROM elleng_team_scores WHERE tournament_id='player-split' AND hole=${hole}`),'37');
 }
 // Captain and player writes use the same tournament lock and must converge.
 await Promise.all([asyncSql(own(A,call('split',10,17))),asyncSql(own('cccccccc-cccc-4ccc-8ccc-cccccccccccc',"SELECT elleng_test_authorized_split_pair('player-split',0,10,1,19);"))]);
 assert.equal(value("SELECT score FROM elleng_team_scores WHERE tournament_id='player-split' AND hole=10"),'36');
 assert.equal(value("SELECT has_function_privilege('anon','elleng_save_own_score_atomic(text,text,integer,integer)','execute')"),'f');
 assert.equal(value("SELECT has_function_privilege('authenticated','elleng_save_own_score_atomic(text,text,integer,integer)','execute')"),'t');
 file('db/releases/client-health/install.sql');
 sql("GRANT SELECT ON elleng_drafts TO authenticated;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO elleng_drafts VALUES('elleng-cup','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{}');");
 const report="SELECT elleng_report_client_event('script_error','scoring','native-test');";
 sql(own(A,report));assert.equal(value('SELECT count(*) FROM elleng_client_events'),'1');
 assert.equal(sql(own(A,'SELECT count(*) FROM elleng_client_events;')).stdout.trim().split('\n').pop(),'0','Ordinary golfer must not read diagnostic records');
 assert.equal(sql(own('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','SELECT count(*) FROM elleng_client_events;')).stdout.trim().split('\n').pop(),'1');
 reject('SET ROLE anon;'+report);reject("SET ROLE authenticated;"+report);reject(own(A,"SELECT elleng_report_client_event('raw private message','scoring','test');"));
 reject(own(A,"INSERT INTO elleng_client_events(actor_id,event_code,route,client_build) VALUES('"+B+"','script_error','scoring','test');"));
 for(let i=0;i<25;i++)sql(own(A,report));assert.equal(value('SELECT count(*) FROM elleng_client_events'),'20','Server rate limit must bound writes');
 sql("UPDATE elleng_client_events SET created_at=clock_timestamp()-interval '1 day';INSERT INTO elleng_client_events(actor_id,event_code,route,client_build,created_at) SELECT '"+A+"','script_error','scoring','test',clock_timestamp()-interval '1 day' FROM generate_series(1,120);");
 sql(own(A,report));assert.equal(value('SELECT count(*) FROM elleng_client_events'),'100','Retention must remain bounded per account');
 console.log('PASS: diagnostic privacy/RLS, fixed-code validation, direct-insert denial, server rate cap and bounded retention');
 console.log('PASS: native player ownership, standard save/clear, Split-Pair 37, incomplete clear, invalid inputs, anonymous/unlinked/closed/mismatched requests, direct-write denial, transaction rollback, five concurrent player races, and captain/player concurrency');
}finally{if(started)run('pg_ctl',['-D',data,'-m','immediate','-w','stop'],undefined,true);fs.rmSync(root,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
