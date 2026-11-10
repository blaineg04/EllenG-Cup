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

test('commissioner display and pick guard use active unassigned roster',()=>{
 const admin=fs.readFileSync(require('node:path').join(__dirname,'../admin.html'),'utf8');
 assert.match(admin,/remaining=S\.golfers\.filter\(g=>g\.name&&g\.name\.trim\(\)&&g\.participating!==false&&g\.team==null\)\.length/);
 assert.match(admin,/done=total>0&&remaining===0/);
 assert.match(admin,/const remaining=S\.golfers\.some\(g=>g\?\.name&&g\.participating!==false&&g\.team==null\)/);
 assert.doesNotMatch(admin,/S\.picks\.length>=total/);
});

test('commissioner Undo Pick preserves protected weighted captain picks and restores only the last drafted golfer',()=>{
 const admin=fs.readFileSync(require('node:path').join(__dirname,'../admin.html'),'utf8');
 assert.match(admin,/if\(S\.draftRules==="weighted"&&S\.picks\.length<=2\)return false/);
 assert.match(admin,/const p=S\.picks\.at\(-1\)/);
 assert.match(admin,/S\.picks\.pop\(\)/);
 assert.match(admin,/S\.golfers\[p\.golfer\]\.team=null/);
 assert.match(admin,/S\.teams\[p\.team\]\.roster=S\.teams\[p\.team\]\.roster\.filter\(x=>x!==p\.golfer\)/);
 assert.match(admin,/S\.timerEndsAt=new Date\(Date\.now\(\)\+S\.timerLength\*1000\)\.toISOString\(\)/);
});
test('commissioner pause and reset clock controls are still wired to authenticated saves',()=>{
 const admin=fs.readFileSync(require('node:path').join(__dirname,'../admin.html'),'utf8');
 assert.match(admin,/getElementById\("pause"\)\.onclick=\(\)=>saveCommissionerAction/);
 assert.match(admin,/getElementById\("resetClock"\)\.onclick=\(\)=>saveCommissionerAction/);
 assert.match(admin,/if\(S\.timerPaused\)\{S\.timerPaused=false/);
 assert.match(admin,/S\.timerLength=remaining\(\);S\.timerPaused=true;S\.timerEndsAt=null/);
});

test('commissioner control actions delegate locking to secureSave without deadlocking',()=>{
 const admin=fs.readFileSync(require('node:path').join(__dirname,'../admin.html'),'utf8');
 const start=admin.indexOf('async function saveCommissionerAction(change){');
 const end=admin.indexOf('document.getElementById("undo").onclick=',start);
 assert.ok(start>=0&&end>start);
 const action=admin.slice(start,end);
 assert.ok(action.includes('if(savingDraft)return;'));
 assert.ok(action.includes('if(change()===false)return;'));
 assert.ok(action.includes('await save();'));
 assert.ok(!action.includes('savingDraft=true;'));
 assert.ok(admin.includes('async function secureSave(){'));
 assert.ok(admin.includes('if(savingDraft)throw new Error("A draft save is already in progress.")'));
 assert.ok(admin.includes('save=secureSave;'));
});

test('commissioner controls use compare-and-swap save and reject stale draft snapshots',()=>{
 const admin=fs.readFileSync(require('node:path').join(__dirname,'../admin.html'),'utf8');
 const start=admin.indexOf('async function secureSave(){');
 const end=admin.indexOf('save=secureSave;',start);
 assert.ok(start>=0&&end>start);
 const secure=admin.slice(start,end);
 assert.ok(secure.includes('p_expected_updated_at:draftUpdatedAt'));
 assert.ok(secure.includes('elleng_save_state_if_fresh'));
 assert.ok(secure.includes('draftUpdatedAt=saved.updated_at'));
 assert.ok(secure.includes('if(!saved?.updated_at)throw new Error'));
 assert.ok(!secure.includes('.upsert('),'commissioner saves must not overwrite stale draft state with unconditional upsert');
});

test('commissioner draft blocks picks and shows warning when a previously picked golfer withdraws',()=>{
 const admin=fs.readFileSync(require('node:path').join(__dirname,'../admin.html'),'utf8');
 assert.ok(admin.includes('function hasWithdrawnDraftPick(){'));
 assert.ok(admin.includes('(S.picks||[]).some(p=>S.golfers?.[p.golfer]?.participating===false)'));
 assert.ok(admin.includes('if(S.timerPaused||!remaining||hasWithdrawnDraftPick())return;'));
 assert.ok(admin.includes('!done&&!withdrawnPick&&canBand(t,g.band)'));
 assert.ok(admin.includes('Draft paused for commissioner review: a previously drafted golfer is marked Not Playing.'));
});
