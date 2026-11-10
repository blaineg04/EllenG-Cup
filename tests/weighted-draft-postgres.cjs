// Disposable PostgreSQL/WASM parity and authorization test. No network or live writes.
// PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite node tests/weighted-draft-postgres.cjs
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
const api=require('../weighted-draft.js');
(async()=>{const db=new PGlite();
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
 await db.exec(fs.readFileSync('tests/actual-captain-rpc.sql','utf8').split('INSERT INTO public.elleng_drafts')[0]);
 const scope=fs.readFileSync('db/releases/draft-participation/scope.sql','utf8');
 await db.exec(scope.slice(scope.indexOf('CREATE OR REPLACE FUNCTION public.elleng_auto_pick')));
 const commissioner=fs.readFileSync('tests/actual-commissioner-rpc.sql','utf8');
 await db.exec(commissioner.slice(commissioner.indexOf('CREATE OR REPLACE FUNCTION'),commissioner.indexOf('INSERT INTO public.elleng_drafts')));
 await db.exec(fs.readFileSync('db/releases/weighted-draft/install.sql','utf8'));
 await db.exec(fs.readFileSync('db/releases/weighted-draft/install.sql','utf8')); // idempotent installation
 const make=(bands)=>({teams:[{captain:'Aaron',roster:[0]},{captain:'Carl',roster:[1]}],golfers:bands.map((band,i)=>({name:i===0?'Aaron':i===1?'Carl':'Golfer '+i,band,self_ranked:true,team:i<2?i:null})),picks:[{golfer:0,team:0},{golfer:1,team:1}],draftType:'snake',timerPaused:true});
 let parity=0;
 for(const bands of ['ABBBCC','AABBCCDD','BBBBCCDD','ABDD','ACBBBBCCD','ADDDDD','AB']){const start=make([...bands]);
  for(let attempt=0;attempt<10;attempt++){const s=structuredClone(start);while(true){const js=api.options(s);const result=await db.query('select public.elleng_weighted_options($1::jsonb) as result',[JSON.stringify(s)]);assert.deepEqual(result.rows[0].result,js);parity++;const n=s.picks.length,t=Math.floor(n/2)%2?1-n%2:n%2;const pool=s.golfers.map((g,i)=>({...g,i})).filter(g=>g.team==null&&js.eligible[t].includes(g.band));if(!pool.length)break;const g=pool[(attempt+n)%pool.length];s.golfers[g.i].team=t;s.teams[t].roster.push(g.i);s.picks.push({golfer:g.i,team:t});}}}
 // Representative tournament-size parity and latency, including the
 // look-ahead logic. This uses disposable PGlite, never production.
 const largeBands=['A','B',...Array(4).fill('B'),...Array(14).fill('C'),...Array(4).fill('D')];
 const largeState=make(largeBands);
 const started=Date.now();
 const largeJS=api.options(largeState);
 const largeDB=(await db.query('select public.elleng_weighted_options($1::jsonb) as result',[JSON.stringify(largeState)])).rows[0].result;
 const elapsed=Date.now()-started;
 assert.deepEqual(largeDB,largeJS,'24-golfer first-pick parity');
 assert.ok(elapsed<30000,'24-golfer parity took '+elapsed+'ms (30s budget)');
 console.log('PASS: 24-golfer initial-pick parity in '+elapsed+'ms');
 // Walk all remaining turns for a realistic 24-player draft, comparing
 // PostgreSQL with JavaScript before every pick.
 const fullState=structuredClone(largeState);
 let fullComparisons=0;
 const fullStart=Date.now();
 while(fullState.picks.length<largeBands.length){
  const js=api.options(fullState);
  const sql=(await db.query('select public.elleng_weighted_options($1::jsonb) as result',[JSON.stringify(fullState)])).rows[0].result;
  assert.deepEqual(sql,js,'24-player parity at pick '+(fullState.picks.length+1));
  fullComparisons++;
  const n=fullState.picks.length,turn=Math.floor(n/2)%2?1-n%2:n%2;
  const index=fullState.golfers.findIndex(g=>g.team==null&&js.eligible[turn].includes(g.band));
  assert.ok(index>=0,'24-player draft stalled at pick '+(n+1));
  fullState.golfers[index].team=turn;
  fullState.teams[turn].roster.push(index);
  fullState.picks.push({golfer:index,team:turn});
 }
 assert.deepEqual(fullState.teams.map(t=>t.roster.length),[12,12]);
 console.log('PASS: '+fullComparisons+' full 24-golfer snake picks checked for JS/PostgreSQL parity in '+(Date.now()-fullStart)+'ms');

 // Exercise the largest supported tournament against the actual SQL engine.
 const maxBands=['A','B',...Array(6).fill('B'),...Array(18).fill('C'),...Array(6).fill('D')];
 const maxState=make(maxBands),maxStart=Date.now();
 const maxExpected=api.options(maxState);
 const maxActual=(await db.query('select public.elleng_weighted_options($1::jsonb) as result',[JSON.stringify(maxState)])).rows[0].result;
 assert.deepEqual(maxActual,maxExpected,'32-player maximum-size parity');
 const maxElapsed=Date.now()-maxStart;
 assert.ok(maxElapsed<30000,'32-player SQL parity exceeded 30s: '+maxElapsed+'ms');
 console.log('PASS: 32-golfer maximum-size PostgreSQL parity in '+maxElapsed+'ms');
 // Enforce the same fail-closed roster cap in the installed SQL engine.
 const oversized=make(['A','B',...Array(31).fill('C')]);
 assert.throws(()=>api.options(oversized),/2–32 playing golfers/);
 await assert.rejects(db.query('select public.elleng_weighted_options($1::jsonb)',[JSON.stringify(oversized)]),/2–32 playing golfers/);
 console.log('PASS: 33-golfer cap enforced by both engines');
 const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',c0='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',c1='cccccccc-cccc-cccc-cccccccccccccccc';
 await db.query('insert into elleng_drafts(id,owner_id,state) values ($1,$2,$3)', ['weighted-test',owner,JSON.stringify(make([...'ABBBCC']))]);
 await db.query('insert into elleng_captains values ($1,$2,0),($1,$3,1)',['weighted-test',c0,c1]);
 const actor=async id=>db.query("select set_config('elleng.test_actor',$1,false)",[id]);
 await actor(c0);await assert.rejects(db.query("select elleng_prepare_weighted_draft('weighted-test')"),/Commissioner/);
 await actor(owner);let s=(await db.query("select elleng_prepare_weighted_draft('weighted-test') as s")).rows[0].s;assert.deepEqual(s,api.prepare(make([...'ABBBCC'])));
 s.timerPaused=false;s.timerEndsAt=new Date(Date.now()+60000).toISOString();await db.query('update elleng_drafts set state=$1 where id=$2',[JSON.stringify(s),'weighted-test']);
 const changedBand=structuredClone(s);changedBand.golfers[2].band='A';
 await assert.rejects(db.query('update elleng_drafts set state=$1 where id=$2',[JSON.stringify(changedBand),'weighted-test']),/locked until the draft is complete/);
 const stamp=(await db.query("select updated_at::text as stamp from elleng_drafts where id='weighted-test'")).rows[0].stamp;
 const bypass=structuredClone(s);bypass.golfers[4].team=1;bypass.teams[1].roster.push(4);bypass.picks.push({golfer:4,team:1});
 await assert.rejects(db.query("select elleng_save_state_if_fresh('weighted-test',$1,$2)",[stamp,JSON.stringify(bypass)]),/weighted pick controls/);
 const broken=structuredClone(s);broken.picks.pop();broken.golfers[1].team=null;broken.teams[1].roster=[];
 await assert.rejects(db.query('select elleng_weighted_options($1)',[JSON.stringify(broken)]),/captain seeds/);
 await actor(c0);await assert.rejects(db.query("select elleng_make_pick('weighted-test',2)"),/not your team/);
 await actor(c1);
 const allowedBefore=api.options(s).eligible[1];
 const deniedBefore=s.golfers.findIndex(g=>g.team==null&&!allowedBefore.includes(g.band));
 assert.ok(deniedBefore>=0,'fixture must include a forbidden pick');
 await assert.rejects(db.query("select elleng_make_pick('weighted-test',$1)",[deniedBefore]),/reduce attainable/);
 const acceptedBefore=s.golfers.findIndex(g=>g.team==null&&allowedBefore.includes(g.band));
 assert.ok(acceptedBefore>=0,'fixture must include an allowed pick');
 s=(await db.query("select elleng_make_pick('weighted-test',$1) as s",[acceptedBefore])).rows[0].s;assert.equal(s.golfers[acceptedBefore].team,1);
 // Commissioner is constrained by the current engine options too.
 // Commissioner can attempt a forbidden pick at the same known-restrictive
 // state as the captain. Restore the disposable fixture after the allowed pick.
 const commissionerFixture=structuredClone(s);
 commissionerFixture.golfers[acceptedBefore].team=null;
 commissionerFixture.teams[1].roster.pop();
 commissionerFixture.picks.pop();
 await db.query('update elleng_drafts set state=$1 where id=$2',[JSON.stringify(commissionerFixture),'weighted-test']);
 await actor(owner);await assert.rejects(db.query("select elleng_weighted_pick('weighted-test',$1)",[deniedBefore]),/reduce attainable/);
 await db.query('update elleng_drafts set state=$1 where id=$2',[JSON.stringify(s),'weighted-test']);
 // Force the deadline only in this disposable fixture, then exercise actual auto wrapper.
 s.timerEndsAt='2000-01-01T00:00:00Z';await db.query('update elleng_drafts set state=$1 where id=$2',[JSON.stringify(s),'weighted-test']);
 const options=api.options(s),before=s.picks.length;s=(await db.query("select elleng_auto_pick('weighted-test') as s")).rows[0].s;
 assert.equal(s.picks.length,before+1);assert.equal(s.picks.at(-1).auto,true);assert.ok(options.eligible[s.picks.at(-1).team].includes(s.golfers[s.picks.at(-1).golfer].band));
 await actor('dddddddd-dddd-dddd-dddd-dddddddddddd');await assert.rejects(db.query("select elleng_weighted_pick('weighted-test',4)"),/Not authorized/);
 console.log('PASS:',parity,'JS/PostgreSQL state comparisons; captain, commissioner, timeout parity and authorization.');await db.close();
})().catch(e=>{console.error(e);process.exit(1)});
