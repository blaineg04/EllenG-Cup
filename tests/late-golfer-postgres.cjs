// Exercises the exact staged late-golfer RPC on disposable PGlite only.
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 try{
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.session(uid uuid); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT uid FROM auth.session LIMIT 1 $$;");
  await db.exec("CREATE TABLE public.elleng_drafts(id text PRIMARY KEY,owner_id uuid,state jsonb,updated_at timestamptz); CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY,draft_id text,status text); CREATE TABLE public.elleng_team_scores(tournament_id text); CREATE TABLE public.elleng_player_hole_scores(tournament_id text); CREATE TABLE public.elleng_pair_hole_scores(tournament_id text); CREATE TABLE public.elleng_player_accounts(draft_id text,golfer_index integer,user_id uuid);");
  await db.exec(fs.readFileSync('db/releases/late-golfer/staged.sql','utf8'));
  const golfers=Array.from({length:28},(_,i)=>i<23?{name:'Golfer '+i,participating:true,team:i%2,band:'C'}:{name:'',participating:false});
  const teams=[{name:'Team 1',roster:golfers.slice(0,23).map((_,i)=>i).filter(i=>i%2===0)},{name:'Team 2',roster:golfers.slice(0,23).map((_,i)=>i).filter(i=>i%2===1)}];
  const picks=Array.from({length:23},(_,i)=>({golfer:i,team:i%2}));
  const state={golfers,teams,picks,playFormat:'shamble_points'};
  await db.query("INSERT INTO public.elleng_drafts VALUES('elleng-cup',$1,$2::jsonb,'2026-11-13T12:51:47Z')",[owner,JSON.stringify(state)]);
  await db.exec("INSERT INTO public.elleng_tournaments VALUES('elleng-cup-live','elleng-cup','setup')");
  const call=(name='Maxwell LeBeouf',band='C',hcp='20',stamp='2026-11-13T12:51:47Z')=>db.query("SELECT public.elleng_add_late_golfer('elleng-cup','elleng-cup-live',$1::timestamptz,$2,1,$3,$4) AS result",[stamp,name,band,hcp]);
  await db.query('INSERT INTO auth.session VALUES($1)',[other]);
  await assert.rejects(call(),/Commissioner access required/);
  await db.query('UPDATE auth.session SET uid=$1',[owner]);
  await assert.rejects(call('Maxwell LeBeouf','C','abc'),/Invalid numeric handicap/);
  await assert.rejects(call('Maxwell LeBeouf','B','20'),/Handicap and band do not match/);
  for(const table of ['elleng_team_scores','elleng_player_hole_scores','elleng_pair_hole_scores']){
    await db.exec(`INSERT INTO public.${table} VALUES('elleng-cup-live')`);
    await assert.rejects(call(),/Scores already exist/,`${table} must block late enrollment`);
    await db.exec(`DELETE FROM public.${table}`);
  }
  const untouched=(await db.query("SELECT state,updated_at FROM public.elleng_drafts WHERE id='elleng-cup'")).rows[0];
  assert.deepEqual(untouched.state,state,'rejected requests must leave all draft state unchanged');
  assert.equal(new Date(untouched.updated_at).getTime(),new Date('2026-11-13T12:51:47Z').getTime(),'rejected requests must not change draft timestamp');
  const saved=await call();
  assert.equal(saved.rows[0].result.golfer_index,23);
  const next=(await db.query("SELECT state FROM public.elleng_drafts WHERE id='elleng-cup'")).rows[0].state;
  assert.deepEqual(next.picks,picks,'existing picks must be byte-for-byte equivalent as JSON');
  assert.deepEqual(next.teams[0].roster,teams[0].roster);
  assert.deepEqual(next.teams[1].roster,[...teams[1].roster,23]);
  assert.equal(next.golfers[23].name,'Maxwell LeBeouf');
  assert.equal(next.golfers[23].late_added,true);
  assert.equal(next.golfers[23].participating,true);
  await assert.rejects(call(),/Tournament changed/);
  const freshStamp=saved.rows[0].result.updated_at;
  await assert.rejects(call('  maxwell lebeouf  ','C','20',freshStamp),/Golfer already exists/);
  await db.query("INSERT INTO public.elleng_player_accounts VALUES('elleng-cup',24,$1)",[other]);
  const second=await call('Another Late Golfer','C','20',freshStamp);
  assert.equal(second.rows[0].result.golfer_index,25,'must skip account-reserved blank golfer slot');
  const final=(await db.query("SELECT state FROM public.elleng_drafts WHERE id='elleng-cup'")).rows[0].state;
  assert.deepEqual(final.picks,picks,'additional late enrollments must not alter picks');
  assert.deepEqual(final.teams[1].roster,[...teams[1].roster,23,25]);
  assert.equal(final.golfers[24].name,'','account-reserved blank slot must remain untouched');
  console.log('PASS: exact staged late golfer RPC authorization, handicap, score guard, append-only roster, unchanged picks, duplicate rejection, reserved account slots and stale-write rejection');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
