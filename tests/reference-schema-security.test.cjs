'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const sql=fs.readFileSync('supabase.sql','utf8');
test('reference schema supports team indexes 0 through 8',()=>{
  assert.match(sql,/team_index\s+integer\s+not\s+null\s+check\s*\(team_index\s+between\s+0\s+and\s+8\)/i);
});
test('direct draft row UPDATE restricted to owner, not captain',()=>{
  const policies=[...sql.matchAll(/create\s+policy\s+("[^"]+"|\S+)\s+on\s+public\.elleng_drafts\s+for\s+update\s+to\s+authenticated\s+using\s*\(([\s\S]*?)\)\s*with\s+check\s*\(([\s\S]*?)\)\s*;/gi)];
  assert.equal(policies.length,1,'exactly one explicit draft-update policy expected');
  const statement=policies[0][0];
  assert.doesNotMatch(statement,/elleng_captains|\sOR\s|\btrue\b/i);
  assert.match(statement,/auth\.uid\(\)/i);
  assert.match(statement,/owner_id/i);
});
test('RLS enabled on draft and captain tables',()=>{
  for(const table of ['elleng_drafts','elleng_captains']){
    assert.match(sql,new RegExp('alter\\s+table\\s+public\\.'+table+'\\s+enable\\s+row\\s+level\\s+security','i'));
  }
});
