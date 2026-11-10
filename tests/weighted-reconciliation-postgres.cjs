// Tests the production reconciliation candidate against disposable PGlite only.
// Synthetic drift mirrors the *known structural differences* but not live SQL bodies.
// PGLITE_MODULE=/path/to/pglite node tests/weighted-reconciliation-postgres.cjs
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await db.exec(fs.readFileSync('tests/actual-captain-rpc.sql','utf8').split('INSERT INTO public.elleng_drafts')[0]);
  const scope=fs.readFileSync('db/releases/draft-participation/scope.sql','utf8');
  await db.exec(scope.slice(scope.indexOf('CREATE OR REPLACE FUNCTION public.elleng_auto_pick')));
  const commissioner=fs.readFileSync('tests/actual-commissioner-rpc.sql','utf8');
  await db.exec(commissioner.slice(commissioner.indexOf('CREATE OR REPLACE FUNCTION'),commissioner.indexOf('INSERT INTO public.elleng_drafts')));
  const install=fs.readFileSync('db/releases/weighted-draft/install.sql','utf8');
  await db.exec(install);
  // Build a disposable approximation of observed production drift.
  const options=(await db.query("SELECT pg_get_functiondef('public.elleng_weighted_options(jsonb)'::regprocedure) AS sql")).rows[0].sql;
  assert.match(options,/public\.elleng_weighted_reachable\(assigned\+1,n,remaining,aa,ab,snake\)/);
  await db.exec(options.replace('public.elleng_weighted_reachable(assigned+1,n,remaining,aa,ab,snake)','true'));
  const guard=(await db.query("SELECT pg_get_functiondef('public.elleng_guard_weighted_roster()'::regprocedure) AS sql")).rows[0].sql;
  assert.match(guard,/IF OLD\.state->>'draftRules' IS DISTINCT FROM 'weighted' THEN RETURN NEW;END IF;/);
  await db.exec(guard.replace("IF OLD.state->>'draftRules' IS DISTINCT FROM 'weighted' THEN RETURN NEW;END IF;","IF OLD.state->>'draftRules' IS DISTINCT FROM 'weighted' OR NEW.state->>'draftRules' IS DISTINCT FROM 'weighted' THEN RETURN NEW;END IF;"));
  await db.exec('DROP FUNCTION public.elleng_weighted_reachable(integer,integer,integer[],integer[],integer[],boolean)');
  const catalog=async()=> (await db.query("SELECT (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.elleng_weighted_options(jsonb)'::regprocedure) options, (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.elleng_guard_weighted_roster()'::regprocedure) guard")).rows[0];
  const hashes=await catalog();
  const candidate=fs.readFileSync('db/releases/weighted-draft/reconcile-production-candidate.sql','utf8');
  await assert.rejects(db.exec(candidate),/Weighted options function changed since preflight/);
  await db.exec('ROLLBACK'); // The expected preflight error leaves an explicit transaction aborted.
  assert.equal((await db.query("SELECT to_regprocedure('public.elleng_weighted_reachable(integer,integer,integer[],integer[],integer[],boolean)') IS NOT NULL AS exists")).rows[0].exists,false);
  const adapted=candidate.replace('a5f4f264fa29bc7165c3007561c5163c',hashes.options).replace('657ab096b909d2940c1e889c7bd31c18',hashes.guard);
  await db.exec(adapted);
  const updated=(await db.query("SELECT pg_get_functiondef('public.elleng_weighted_options(jsonb)'::regprocedure) AS sql")).rows[0].sql;
  assert.match(updated,/elleng_weighted_reachable/);
  const updatedGuard=(await db.query("SELECT pg_get_functiondef('public.elleng_guard_weighted_roster()'::regprocedure) AS sql")).rows[0].sql;
  assert.match(updatedGuard,/Weighted draft rules cannot be disabled/);
  assert.equal((await db.query("SELECT to_regprocedure('public.elleng_weighted_reachable(integer,integer,integer[],integer[],integer[],boolean)') IS NOT NULL AS exists")).rows[0].exists,true);
  const state={teams:[{captain:'Aaron',roster:[0]},{captain:'Carl',roster:[1]}],golfers:['A','B','B','B','C','C'].map((band,i)=>({name:i===0?'Aaron':i===1?'Carl':'Golfer '+i,band,self_ranked:true,team:i<2?i:null})),picks:[{golfer:0,team:0},{golfer:1,team:1}],draftType:'snake',timerPaused:true};
  const result=(await db.query('SELECT public.elleng_weighted_options($1::jsonb) AS options',[JSON.stringify(state)])).rows[0].options;
  assert.ok(result.eligible,'patched weighted options must return eligibility');
  await assert.rejects(db.exec(adapted),/Reachability function already exists/);
  await db.exec('ROLLBACK');
  console.log('PASS: synthetic production drift reconciles, fail-closed preflight, guard protection, options callable, replay blocked');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
