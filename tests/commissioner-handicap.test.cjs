const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=fs.readFileSync('scoring.html','utf8');
const sql=fs.readFileSync('db/releases/commissioner-handicap/install.sql','utf8');
test('commissioner editor exposes handicap controls on both player views',()=>{
 assert.match(ui,/function commissionerHandicapControl\(i,g\)/);
 assert.match(ui,/commissionerHandicapControl\(i,g\)/);
 assert.match(ui,/draftState\?\.golfers\?\.\[i\]\?\.name\?commissionerHandicapControl\(i,draftState\.golfers\[i\]\)/);
 assert.match(ui,/bindCommissionerHandicaps\(\$\("playerEditor"\)\)/);
});
test('commissioner save is a scoped authenticated RPC with stale-write protection',()=>{
 assert.match(ui,/db\.rpc\("elleng_set_commissioner_handicap"/);
 assert.match(ui,/p_expected_updated_at:draftUpdatedAt/);
 assert.match(sql,/d\.owner_id IS DISTINCT FROM auth\.uid\(\)/);
 assert.match(sql,/d\.updated_at IS DISTINCT FROM p_expected_updated_at/);
 assert.match(sql,/t\.status IS DISTINCT FROM 'setup'/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.elleng_set_commissioner_handicap.*TO authenticated/);
});
test('commissioner handicap is submitted, numeric validated and does not rewrite teams',()=>{
 assert.match(sql,/jsonb_build_object\('hcp',h,'band',b,'self_ranked',true\)/);
 assert.match(sql,/n<0 OR n>54/);
 assert.match(sql,/IF length\(h\)>8/);
 assert.doesNotMatch(sql,/jsonb_set\(s,.*'teams'/);
});
test('player self-edit flow remains available',()=>{
 assert.match(ui,/id="saveSelfHandicap"/);
 assert.match(ui,/async function saveSelfHandicap\(/);
});

test('commissioner SQL migration is structurally complete and has an anchored numeric pattern',()=>{
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.equal((sql.match(/^GRANT EXECUTE ON FUNCTION/gm)||[]).length,1);
 assert.match(sql,/h !~ '\^\[0-9\]\+\(\[\.\]\[0-9\]\+\)\?\$'/);
 assert.match(sql,/TO authenticated;\s*$/);
});
