'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {draftRosterPlan,draftTurnAtPick,draftPickOrder}=require('../event-rsvp-eligibility.js');
const fs=require('node:fs');
const vm=require('node:vm');
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

test('snake partial final round allocates seats to the teams actually on the clock',()=>{
 const plan=draftRosterPlan(rows(27),'nov20',golfers,7,'snake');
 assert.deepEqual(plan.teamCapacities,[3,4,4,4,4,4,4]);
 assert.deepEqual(draftPickOrder(plan.teamCapacities,'snake').slice(-6),[6,5,4,3,2,1]);
});
test('straight draft allocates partial final round from the first team',()=>{
 const plan=draftRosterPlan(rows(27),'nov20',golfers,7,'straight');
 assert.deepEqual(plan.teamCapacities,[4,4,4,4,4,4,3]);
 assert.deepEqual(draftPickOrder(plan.teamCapacities,'straight').slice(-6),[0,1,2,3,4,5]);
 assert.deepEqual(draftPickOrder(plan.teamCapacities,'standard'),draftPickOrder(plan.teamCapacities,'straight'));
});
test('approved-roster draft plan stays identical to live common.js turn order',()=>{
 const source=fs.readFileSync('common.js','utf8');
 const start=source.indexOf('function order(n){'),end=source.indexOf('function bandCounts()',start);
 assert.ok(start>=0&&end>start,'Live draft order must be present');
 const liveOrderSource=source.slice(start,end);
 for(const [count,teams] of [[8,3],[10,4],[17,5],[27,7],[29,2],[36,9]]){
  for(const format of ['snake','straight']){
   const ctx={S:{teams:Array.from({length:teams},()=>({})),draftType:format},cfg:{defaultTeamCount:7}};
   vm.runInNewContext(liveOrderSource+'\nthis.liveOrder=order;',ctx);
   const expected=Array.from({length:count},(_,i)=>ctx.liveOrder(i));
   const plan=draftRosterPlan(rows(count),'nov20',golfers,teams,format);
   const planned=draftPickOrder(plan.teamCapacities,format);
   assert.deepEqual(planned,expected,`${count} golfers / ${teams} teams / ${format}`);
   assert.deepEqual(Array.from({length:count},(_,i)=>draftTurnAtPick(i,teams,format)),expected);
   assert.equal(plan.teamCapacities.reduce((sum,n)=>sum+n,0),count);
  }
 }
});
test('unknown draft format cannot silently create a different turn schedule',()=>{
 assert.throws(()=>draftRosterPlan(rows(8),'nov20',golfers,3,'random'),/Invalid draft format/);
 assert.throws(()=>draftTurnAtPick(0,3,'random'),/Invalid draft format/);
 assert.throws(()=>draftTurnAtPick(-1,3),RangeError);
});
