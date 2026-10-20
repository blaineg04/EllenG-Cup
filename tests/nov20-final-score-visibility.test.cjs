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
