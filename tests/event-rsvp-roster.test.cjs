'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {approvedGolferIndices}=require('../event-rsvp-client.js');
const event='nov20';
const row=(user,index,status='playing',approval='approved',tournament_id=event)=>({
 tournament_id,user_id:user,golfer_index:index,status,approval_status:approval
});
test('approved roster includes only approved playing golfers for the selected tournament',()=>{
 const rows=[row('alice',3),row('bob',1),row('charlie',2,'maybe'),row('dana',4,'playing','pending'),row('eve',5,'out'),row('other',0,'playing','approved','next')];
 assert.deepEqual(approvedGolferIndices(rows,event),[1,3]);
 assert.deepEqual(approvedGolferIndices(rows,'next'),[0]);
});
test('duplicate approved golfer identity is rejected rather than silently deduplicated',()=>{
 assert.throws(()=>approvedGolferIndices([row('alice',1),row('bob',1)],event),/Duplicate approved golfer/);
});
test('duplicate account enrollment in one event is rejected',()=>{
 assert.throws(()=>approvedGolferIndices([row('alice',1),row('alice',2,'maybe')],event),/Duplicate RSVP account/);
});
test('unrelated events cannot affect eligibility even with overlapping identities',()=>{
 assert.deepEqual(approvedGolferIndices([row('alice',1),row('alice',1,'playing','approved','next')],event),[1]);
});
test('invalid inputs fail closed',()=>{
 assert.throws(()=>approvedGolferIndices(null,event),TypeError);
 assert.throws(()=>approvedGolferIndices([],''),/Tournament ID/);
 assert.throws(()=>approvedGolferIndices([row('alice',-1)],event),/Verified golfer index/);
 assert.throws(()=>approvedGolferIndices([row('alice',1,'unknown')],event),/Invalid RSVP status/);
 assert.throws(()=>approvedGolferIndices([row('alice',1,'playing','unknown')],event),/Invalid approval status/);
});
