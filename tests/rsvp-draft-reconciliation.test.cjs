'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {reconcileDraftRoster}=require('../event-rsvp-eligibility.js');
const directory=[{name:'Alice'},{name:'Bob'},{name:'Carol'}];
const rows=[0,1].map(i=>({tournament_id:'nov20',user_id:'user'+i,golfer_index:i,status:'playing',approval_status:'approved'}));
test('read-only RSVP reconciliation detects missing, mismatched and unapproved draft slots',()=>{
 const draft=[{name:'Alice'},{name:'Robert'},{name:'Carol'}];
 const before=structuredClone(draft);
 const result=reconcileDraftRoster(rows,'nov20',directory,draft);
 assert.deepEqual(result.approvedIndices,[0,1]);
 assert.deepEqual(result.missingIndices,[]);
 assert.deepEqual(result.mismatchedIndices,[1]);
 assert.deepEqual(result.unapprovedNamedIndices,[2]);
 assert.equal(result.ready,false);
 assert.deepEqual(draft,before);
 assert.ok(Object.isFrozen(result));
});
test('approved roster reconciliation is event-scoped and fails closed on invalid approval',()=>{
 const valid=reconcileDraftRoster(rows,'nov20',directory,[{name:'Alice'},{name:'Bob'}]);
 assert.equal(valid.ready,true);
 assert.deepEqual(valid.unapprovedNamedIndices,[]);
 const other={...rows[0],tournament_id:'another',user_id:'outsider',golfer_index:2};
 assert.equal(reconcileDraftRoster([...rows,other],'nov20',directory,[{name:'Alice'},{name:'Bob'}]).ready,true);
 assert.throws(()=>reconcileDraftRoster([{...rows[0],approval_status:'bogus'}],'nov20',directory,[]),/Invalid approval status/);
});
test('approved RSVP missing from draft is not silently accepted',()=>{
 const result=reconcileDraftRoster(rows,'nov20',directory,[{name:'Alice'}]);
 assert.deepEqual(result.missingIndices,[1]);
 assert.equal(result.ready,false);
});

test('empty approved RSVP roster never reports draft ready',()=>{
 const result=reconcileDraftRoster([],'nov20',directory,[]);
 assert.equal(result.ready,false);
 assert.deepEqual(result.approvedIndices,[]);
 const pending=[{...rows[0],approval_status:'pending'}];
 assert.equal(reconcileDraftRoster(pending,'nov20',directory,[]).ready,false);
});
