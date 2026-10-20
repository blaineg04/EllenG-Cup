const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','scoring.html'),'utf8');
const match=html.match(/function validShambleScoreRow\(row\)\{[^\n]+\}/);
assert.ok(match,'shamble validation helper missing');
const valid=vm.runInNewContext('('+match[0]+')');
test('shamble only counts completed valid golfer scores',()=>{
 for(const row of [undefined,null,{}, {score:null},{score:''},{score:0},{score:21},{score:'NaN'},{score:4.5}])
  assert.equal(valid(row),false,JSON.stringify(row));
 for(const row of [{score:1},{score:4},{score:'5'},{score:20}])
  assert.equal(valid(row),true,JSON.stringify(row));
});
test('roster-derived shamble totals require all golfer entries',()=>{
 assert.match(html,/entered\.every\(validShambleScoreRow\)/);
 assert.match(html,/rows\.every\(validShambleScoreRow\)/);
 assert.match(html,/verifiedRows\.every\(validShambleScoreRow\)/);
});
