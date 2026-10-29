// Guard against treating malformed persisted player/pair score values as completed strokes.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','scoring.html'),'utf8');
const start=html.indexOf('function validStoredPlayerScore(row){');
const end=html.indexOf('function renderShambleScoring(',start);
assert.ok(start>=0&&end>start,'stored-score validator must exist in scoring page');
const ctx={};vm.runInNewContext(html.slice(start,end),ctx);
const valid=row=>ctx.validStoredPlayerScore(row);
test('valid integer player and pair scores 1 to 20',()=>{
 for(const score of [1,4,20,'1','12','20'])assert.equal(valid({score}),true,String(score));
});
test('null, blank, boolean, decimal, invalid and out-of-range stored scores are incomplete',()=>{
 for(const score of [null,undefined,'',' ',true,false,0,-1,21,1.5,'oops',Infinity]){
  assert.equal(valid({score}),false,String(score));
 }
 assert.equal(valid(null),false);
 assert.equal(valid({}),false);
});
test('hole completion requires every roster member or pair to have valid persisted score',()=>{
 const good=[{score:3},{score:5},{score:'4'},{score:6}];
 assert.equal(good.every(valid),true);
 for(const bad of [{score:''},{score:true},{score:21},{score:null}]){
  assert.equal([...good.slice(0,3),bad].every(valid),false);
  assert.equal([good[0],bad].every(valid),false);
 }
});

test('Shamble progress counts only valid stored score rows',()=>{
 const rows=[{score:3},{score:''},{score:true},{score:'5'}];
 assert.equal(rows.filter(valid).length,2);
 assert.match(html,/entered\.filter\(validStoredPlayerScore\)\.length/);
});

test('Split-Pair persistence requires four golfers and two valid pair scores',()=>{
 assert.match(html,/const complete=roster\.length===4&&validPair\(a\)&&validPair\(b\)/);
 assert.match(html,/elleng_test_authorized_split_pair/);
 const shouldPost=(roster,a,b)=>roster.length===4&&valid(a)&&valid(b);
 assert.equal(shouldPost([0,1,2,3],{score:3},{score:4}),true);
 assert.equal(shouldPost([0,1,2],{score:3},{score:4}),false);
 for(const bad of [null,{score:''},{score:0},{score:21},{score:true},{score:1.5}]){
  assert.equal(shouldPost([0,1,2,3],{score:3},bad),false);
 }
});
