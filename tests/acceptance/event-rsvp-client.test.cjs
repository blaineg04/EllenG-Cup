const test=require('node:test');
const assert=require('node:assert/strict');
const rsvp=require('../../event-rsvp-client.js');
function fakeDb(){
 const calls=[];
 return {
  calls,
  rpc(name,args){calls.push({name,args});return Promise.resolve({data:{ok:true},error:null})},
  from(table){calls.push({table});return {
   select(fields){calls.push({fields});return {
    eq(field,value){calls.push({field,value});return Promise.resolve({data:[{golfer_index:1,status:'playing',approval_status:'approved'}],error:null})}
   }}
  }}
 };
}
test('reads only the selected tournament, not draft-scoped RSVPs',async()=>{
 const db=fakeDb();
 const rows=await rsvp.list(db,'event-20');
 assert.equal(rows.length,1);
 assert.deepEqual(db.calls.filter(x=>x.table||x.field),[{table:'elleng_event_rsvps'},{field:'tournament_id',value:'event-20'}]);
});
test('submits validated status through authenticated RPC',async()=>{
 const db=fakeDb();
 await rsvp.submit(db,'event-20',4,'playing');
 assert.deepEqual(db.calls[0],{name:'elleng_submit_event_rsvp',args:{p_tournament_id:'event-20',p_golfer_index:4,p_status:'playing'}});
 await assert.rejects(rsvp.submit(db,'event-20',4,'clear'),/Invalid RSVP/);
 await assert.rejects(rsvp.submit(db,'event-20',-1,'playing'),/Verified golfer/);
 assert.equal(db.calls.length,1);
});
test('commissioner enrollment and approval call separate RPCs',async()=>{
 const db=fakeDb();
 await rsvp.enroll(db,'event-20','account-1',4);
 await rsvp.decide(db,'event-20','account-1','approved');
 assert.deepEqual(db.calls.map(x=>x.name),['elleng_assign_event_golfer','elleng_approve_event_rsvp']);
 await assert.rejects(rsvp.decide(db,'event-20','account-1','pending'),/Invalid approval/);
});
test('only approved playing golfers are eligible, without duplicates',()=>{
 assert.deepEqual(rsvp.approvedGolferIndices([
  {golfer_index:2,status:'playing',approval_status:'approved'},
  {golfer_index:2,status:'playing',approval_status:'approved'},
  {golfer_index:3,status:'maybe',approval_status:'approved'},
  {golfer_index:4,status:'playing',approval_status:'pending'},
  {golfer_index:-1,status:'playing',approval_status:'approved'}
 ]),[2]);
});
test('surfaces Supabase RPC errors rather than claiming a saved RSVP',async()=>{
 const db={from(){},rpc(){return Promise.resolve({error:new Error('Permission denied')})}};
 await assert.rejects(rsvp.submit(db,'event-20',4,'playing'),/Permission denied/);
});
