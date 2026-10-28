'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {approvedGolferIndices}=require('../event-rsvp-client.js');
const event='nov20';
const golfers=Array.from({length:8},(_,i)=>({name:'Golfer '+i}));
const row=(user,index,status='playing',approval='approved',tournament_id=event)=>({
 tournament_id,user_id:user,golfer_index:index,status,approval_status:approval
});
test('approved roster includes only approved playing golfers for the selected tournament',()=>{
 const rows=[row('alice',3),row('bob',1),row('charlie',2,'maybe'),row('dana',4,'playing','pending'),row('eve',5,'out'),row('other',0,'playing','approved','next')];
 assert.deepEqual(approvedGolferIndices(rows,event,golfers),[1,3]);
 assert.deepEqual(approvedGolferIndices(rows,'next',golfers),[0]);
});
test('duplicate approved golfer identity is rejected rather than silently deduplicated',()=>{
 assert.throws(()=>approvedGolferIndices([row('alice',1),row('bob',1)],event,golfers),/Duplicate approved golfer/);
});
test('duplicate account enrollment in one event is rejected',()=>{
 assert.throws(()=>approvedGolferIndices([row('alice',1),row('alice',2,'maybe')],event,golfers),/Duplicate RSVP account/);
});
test('unrelated events cannot affect eligibility even with overlapping identities',()=>{
 assert.deepEqual(approvedGolferIndices([row('alice',1),row('alice',1,'playing','approved','next')],event,golfers),[1]);
});
test('invalid inputs fail closed',()=>{
 assert.throws(()=>approvedGolferIndices(null,event,golfers),TypeError);
 assert.throws(()=>approvedGolferIndices([],'',golfers),/Tournament ID/);
 assert.throws(()=>approvedGolferIndices([row('alice',-1)],event,golfers),/Verified golfer index/);
 assert.throws(()=>approvedGolferIndices([row('alice',1,'unknown')],event,golfers),/Invalid RSVP status/);
 assert.throws(()=>approvedGolferIndices([row('alice',1,'playing','unknown')],event,golfers),/Invalid approval status/);
});

test('approved golfer must exist in the tournament directory',()=>{
 assert.throws(()=>approvedGolferIndices([row('alice',99)],event,golfers),/missing from directory/);
 assert.throws(()=>approvedGolferIndices([row('alice',1)],event,[]),/missing from directory/);
});

test('enrolled golfer with NULL RSVP is not eligible, but does not block approved players',()=>{
 const enrolled=row('unresponded',6,null,'pending');
 assert.deepEqual(approvedGolferIndices([row('alice',1),enrolled],event,golfers),[1]);
 assert.deepEqual(approvedGolferIndices([enrolled],event,golfers),[]);
 assert.throws(()=>approvedGolferIndices([{...enrolled,status:undefined}],event,golfers),/Invalid RSVP status/);
});
