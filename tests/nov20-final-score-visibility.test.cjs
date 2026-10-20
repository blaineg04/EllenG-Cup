const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'..','sql','nov20-final-team-score-visibility.sql'),'utf8');
test('final score visibility: eliminate restrictive ALL policy',()=>{
 assert.match(sql,/DROP POLICY IF EXISTS "active live team guard team scores"/);
 assert.doesNotMatch(sql,/CREATE POLICY[^;]+FOR ALL/i);
});
test('score writes retain restrictive status guard in all three operations',()=>{
 for(const command of ['INSERT','UPDATE','DELETE']){
  const fragment=sql.match(new RegExp('CREATE POLICY[^;]+FOR '+command+'[^;]+;','i'))?.[0];
  assert.ok(fragment,'missing '+command+' policy');
  assert.match(fragment,/AS RESTRICTIVE/);
  assert.match(fragment,/t\.status IN \('setup','live'\)/);
  assert.match(fragment,/team_index < t\.team_count/);
 }
});
test('migration never touches score records',()=>{
 assert.doesNotMatch(sql,/\b(TRUNCATE|DELETE FROM|UPDATE public\.|DROP TABLE)\b/i);
 assert.match(sql,/BEGIN;/);
 assert.match(sql,/COMMIT;/);
});

test('all scoring tables preserve finalized reads and limit writes',()=>{
 for(const [table,old] of [
  ['elleng_team_scores','active live team guard team scores'],
  ['elleng_player_hole_scores','active live team guard player scores'],
  ['elleng_pair_hole_scores','active live team guard pair scores']
 ]){
  assert.ok(sql.includes('DROP POLICY IF EXISTS "'+old+'" ON public.'+table));
  for(const operation of ['INSERT','UPDATE','DELETE']){
   const expressions=[...sql.matchAll(/CREATE POLICY[^;]+;/gi)].map(x=>x[0]);
   const policy=expressions.find(x=>x.includes('ON public.'+table)&&x.includes('FOR '+operation));
   assert.ok(policy,table+' missing '+operation+' protection');
   assert.match(policy,/AS RESTRICTIVE/);
   assert.match(policy,/status IN \('setup','live'\)/);
  }
 }
});

test('migration is repeatable: every added write policy is dropped before recreation',()=>{
 const creations=[...sql.matchAll(/CREATE POLICY "([^"]+)" ON public\\.([a-z_]+)/g)];
 assert.equal(creations.length,9,'expected three guards for each of three score tables');
 for(const match of creations){
  const drop='DROP POLICY IF EXISTS "'+match[1]+'" ON public.'+match[2]+';';
  assert.ok(sql.indexOf(drop)>=0,'missing repeatable guard cleanup: '+match[1]);
  assert.ok(sql.indexOf(drop)<match.index,'cleanup must precede create: '+match[1]);
 }
});
