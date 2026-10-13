const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('main entry routes to the actual scoring page',()=>{
 const html=read('index.html');
 assert.match(html,/location\.replace\(["']\.\/scoring\.html\?v=/);
 assert.ok(fs.existsSync(path.join(root,'scoring.html')));
});
test('entry and scoring version match, avoiding stale tournament pages',()=>{
 const entry=read('index.html');
 const scoring=read('scoring.html');
 const redirect=entry.match(/scoring\.html\?v=([\d.]+)/);
 const meta=scoring.match(/name="elleng-app-version"\s+content="([^"]+)"/);
 assert.ok(redirect,'missing entry version');
 assert.ok(meta,'missing scoring version');
 assert.equal(redirect[1],meta[1]);
});
test('primary tournament pages are linked from scoring',()=>{
 const html=read('scoring.html');
 for(const page of ['draft.html','captain.html'])
  assert.ok(html.includes(page),'scoring page missing '+page+' link');
});
test('Supabase credentials are loaded from configuration, not hardcoded in shared draft code',()=>{
 const common=read('common.js');
 assert.match(common,/window\.ELLENG_CONFIG/);
 assert.match(common,/cfg\.supabaseUrl/);
 assert.doesNotMatch(common,/https:\/\/[^\s"'\x60]+\.supabase\.co/);
});
