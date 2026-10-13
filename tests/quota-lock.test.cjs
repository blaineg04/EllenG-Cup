const test=require('node:test');
const assert=require('node:assert/strict');
const {approve,startPlay,editDraft}=require('../quota-lock.js');
const assignments=[{id:'one',band:'A',quota:23},{id:'two',band:'D',quota:10}];
const draft={status:'draft',players:assignments};
const timestamp='2026-10-13T20:00:00.000Z';
test('commissioner can approve a valid draft and start locked play',()=>{
 const approved=approve(draft,'commissioner',timestamp);
 assert.equal(approved.ok,true);
 assert.equal(approved.status,'approved');
 assert.equal(approved.approvedBy,'commissioner');
 const locked=startPlay(approved);
 assert.equal(locked.ok,true);
 assert.equal(locked.status,'locked');
 assert.deepEqual(locked.players,assignments);
});
test('approval requires draft state, approver and valid timestamp',()=>{
 assert.equal(approve({...draft,status:'approved'},'commissioner',timestamp).ok,false);
 assert.equal(approve(draft,'',timestamp).ok,false);
 assert.equal(approve(draft,'commissioner','not-a-date').ok,false);
});
test('cannot start play without approval',()=>{
 assert.equal(startPlay(draft).ok,false);
 assert.equal(startPlay({status:'approved',players:assignments}).ok,false);
});
test('draft edits accepted before approval and blocked after',()=>{
 const changed=editDraft(draft,[{id:'one',band:'A',quota:21}]);
 assert.equal(changed.ok,true);
 assert.equal(changed.players[0].quota,21);
 const approved=approve(draft,'commissioner',timestamp);
 assert.equal(editDraft(approved,assignments).ok,false);
 assert.equal(editDraft(startPlay(approved),assignments).ok,false);
});
test('rejects duplicate identifiers and malformed quota assignments',()=>{
 const duplicate=[...assignments,{id:'one',band:'B',quota:20}];
 assert.equal(approve({status:'draft',players:duplicate},'commissioner',timestamp).ok,false);
 assert.equal(editDraft(draft,[{id:'x',band:'E',quota:1}]).ok,false);
 assert.equal(editDraft(draft,[{id:'x',band:'C',quota:-1}]).ok,false);
 assert.equal(editDraft(draft,[]).ok,false);
});
test('approval and lock snapshots do not share mutable player objects',()=>{
 const approved=approve(draft,'commissioner',timestamp);
 const locked=startPlay(approved);
 assignments[0].quota=99;
 assert.equal(approved.players[0].quota,23);
 approved.players[0].quota=88;
 assert.equal(locked.players[0].quota,23);
 assignments[0].quota=23;
});
