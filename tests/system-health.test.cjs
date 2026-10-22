// Isolated static safety checks for the read-only health preview.
// Run: node --test tests/system-health.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const page=fs.readFileSync(path.resolve(__dirname,'../system-health.html'),'utf8');
const inline=page.match(/<script>\s*([\s\S]*?)<\/script>/);
test('health page inline JS parses',()=>{
 assert.ok(inline,'inline controller not found');
 assert.doesNotThrow(()=>new vm.Script(inline[1],{filename:'system-health.html'}));
});
test('commissioner session and ownership are verified before showing dashboard',()=>{
 assert.match(page,/auth\.getUser\(\)/);
 assert.match(page,/\.select\("owner_id"\)/);
 assert.match(page,/data\.owner_id!==user\.id/);
 assert.match(page,/dashboard\.hidden=true/);
 assert.match(page,/dashboard\.hidden=false/);
 assert.match(page,/if\(!await verifyCommissioner\(\)\)return/);
});
test('read-only checks cannot mutate draft or scoring records',()=>{
 assert.ok(inline);
 const code=inline[1];
 for(const expression of [/\.upsert\s*\(/,/\.insert\s*\(/,/\.update\s*\(/,/\.delete\s*\(/,/\.rpc\s*\(/])
  assert.doesNotMatch(code,expression);
 assert.match(code,/\.select\("updated_at"\)/);
});
test('uncorroborated server-side features explicitly remain unverified',()=>{
 for(const text of ['Scoring writes','Device offline submissions','Backups / restore','Deployment / rollback'])
  assert.ok(page.includes(text),text+' missing');
 assert.match(page,/No live score is changed here/);
});
test('provides accessible inspection and narrow-phone sizing',()=>{
 assert.match(page,/role="status"/);
 assert.match(page,/minmax\(min\(100%,280px\),1fr\)/);
 assert.match(page,/@media\(max-width:360px\)/);
});

test('an account switch during asynchronous authorization cannot reveal health information',()=>{
 assert.match(page,/const \{data:latest,error:latestError\}=await client\.auth\.getUser\(\)/);
 assert.match(page,/latest\?\.user\?\.id!==user\.id/);
 assert.match(page,/Session changed\. Please sign in again\./);
});
test('network status updates do not assert that offline submissions were saved',()=>{
 assert.match(page,/addEventListener\("offline"/);
 assert.match(page,/addEventListener\("online"/);
 assert.match(page,/Pending score submissions cannot yet be measured/);
});
