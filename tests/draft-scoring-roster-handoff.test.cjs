// Test the actual scoring page's draft-to-shamble roster mapping.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'..','scoring.html'),'utf8');
const a=src.indexOf('function teamRosterGolfers(teamIndex){'),b=src.indexOf('function renderShambleScoring(',a);
assert.ok(a>=0&&b>a);
function rosterOf(roster,golfers){const ctx={draftState:{teams:[{roster}],golfers}};vm.runInNewContext(src.slice(a,b),ctx);return Array.from(ctx.teamRosterGolfers(0),v=>({...v}));}
const players=[{name:'Ada'},{name:'Ben'},{name:'Cora'}];
test('numeric and numeric-string indices survive draft to shamble',()=>assert.deepEqual(rosterOf([0,'1',{golferIndex:'2'}],players),[{index:0,name:'Ada'},{index:1,name:'Ben'},{index:2,name:'Cora'}]));
test('invalid, duplicate and out-of-range roster entries are excluded',()=>assert.deepEqual(rosterOf([0,'0',-1,3,null,'',true,'abc',{golferIndex:99}],players),[{index:0,name:'Ada'}]));
test('missing golfer records cannot create fake score entries',()=>assert.deepEqual(rosterOf([0,1,2],[{name:'Ada'},null,{name:' '}]),[{index:0,name:'Ada'}]));
