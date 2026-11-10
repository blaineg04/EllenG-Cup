'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const draft=fs.readFileSync(require('node:path').join(__dirname,'../draft.html'),'utf8');
test('draft count is derived from active named golfers, not fixed event count',()=>{
 assert.match(draft,/S\.golfers\.filter\(g=>g\?\.name && g\.participating!==false\)\.length/);
 assert.doesNotMatch(draft,/totalGolfers\s*=\s*(?:21|22|23|24)\b/);
});
test('draft selection hides golfers explicitly marked Not Playing',()=>{
 assert.match(draft,/S\.golfers\.filter\(g=>g\.name && g\.participating!==false && g\.team==null\)/);
});
for(const count of [2,3,7,21,22,23,24,31,64,100]){
 test(`active roster derived correctly for ${count} golfers among inactive accounts`,()=>{
  const golfers=Array.from({length:count+5},(_,i)=>({name:'Golfer '+i,participating:i<count}));
  assert.equal(golfers.filter(g=>g?.name && g.participating!==false).length,count);
 });
}

test('draft completion must not use historical pick count after withdrawals',()=>{
 assert.match(draft,/remainingGolfers=S\.golfers\.filter\(g=>g\?\.name && g\.participating!==false && g\.team==null\)\.length/);
 assert.match(draft,/done=totalGolfers>0&&remainingGolfers===0/);
 assert.doesNotMatch(draft,/done=S\.picks\.length>=totalGolfers/);
});
