'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {draftRosterPlan,draftPickOrder}=require('../event-rsvp-eligibility.js');
const golfers=Array.from({length:36},(_,i)=>({name:'Golfer '+i}));
const rows=n=>Array.from({length:n},(_,i)=>({tournament_id:'nov20',user_id:'user'+i,golfer_index:i,status:'playing',approval_status:'approved'}));
test('uneven 8-player draft across 3 teams has no lost seats',()=>{
 const plan=draftRosterPlan(rows(8),'nov20',golfers,3);
 assert.deepEqual(plan.teamCapacities,[3,3,2]);
 assert.equal(plan.teamCapacities.reduce((a,b)=>a+b,0),8);
 assert.equal(plan.approvedIndices.length,8);
});
test('two-team unlimited format distributes odd counts without dropping players',()=>{
 const plan=draftRosterPlan(rows(29),'nov20',golfers,2);
 assert.deepEqual(plan.teamCapacities,[15,14]);
});
test('nine teams of four remain supported',()=>{
 assert.deepEqual(draftRosterPlan(rows(36),'nov20',golfers,9).teamCapacities,Array(9).fill(4));
});
test('reject impossible or invalid team configuration',()=>{
 assert.throws(()=>draftRosterPlan(rows(2),'nov20',golfers,3),/Approved golfer count/);
 for(const n of [0,1,37,2.5])assert.throws(()=>draftRosterPlan(rows(8),'nov20',golfers,n),RangeError);
});
test('only approved event participants count toward team capacity',()=>{
 const r=rows(4);r.push({tournament_id:'next',user_id:'other',golfer_index:4,status:'playing',approval_status:'approved'});
 r.push({tournament_id:'nov20',user_id:'pending',golfer_index:5,status:'playing',approval_status:'pending'});
 assert.deepEqual(draftRosterPlan(r,'nov20',golfers,2).teamCapacities,[2,2]);
});

test('snake draft reverses alternate rounds and skips full teams',()=>{
 assert.deepEqual(draftPickOrder([3,3,2]),[0,1,2,2,1,0,0,1]);
});
test('standard draft retains team order while respecting uneven capacities',()=>{
 assert.deepEqual(draftPickOrder([3,3,2],'standard'),[0,1,2,0,1,2,0,1]);
});
test('two-team odd roster yields exactly one pick per golfer',()=>{
 const capacities=draftRosterPlan(rows(29),'nov20',golfers,2).teamCapacities;
 const order=draftPickOrder(capacities);
 assert.equal(order.length,29);
 assert.deepEqual(order.reduce((counts,i)=>(counts[i]++,counts),[0,0]),[15,14]);
});
test('invalid draft capacities and format fail closed',()=>{
 for(const capacities of [[],[2],[1,0],[1,-1],[1,1.5],null])
   assert.throws(()=>draftPickOrder(capacities),RangeError);
 assert.throws(()=>draftPickOrder([2,2],'random'),/Invalid draft format/);
});
