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
test('approved roster is scoped to event, verified directory and playing approval',()=>{
 const golfers=Array.from({length:5},(_,i)=>({name:'Golfer '+i}));
 assert.deepEqual(rsvp.approvedGolferIndices([
  {tournament_id:'nov20',user_id:'a',golfer_index:2,status:'playing',approval_status:'approved'},
  {tournament_id:'next',user_id:'a',golfer_index:2,status:'playing',approval_status:'approved'},
  {tournament_id:'nov20',user_id:'b',golfer_index:3,status:'maybe',approval_status:'approved'},
  {tournament_id:'nov20',user_id:'c',golfer_index:4,status:'playing',approval_status:'pending'}
 ],'nov20',golfers),[2]);
});
test('duplicate approved golfer and missing directory golfer fail closed',()=>{
 const golfers=[{name:'Golfer 0'},{name:'Golfer 1'}];
 const record=(user,index)=>({tournament_id:'nov20',user_id:user,golfer_index:index,status:'playing',approval_status:'approved'});
 assert.throws(()=>rsvp.approvedGolferIndices([record('a',1),record('b',1)],'nov20',golfers),/Duplicate approved golfer/);
 assert.throws(()=>rsvp.approvedGolferIndices([record('a',2)],'nov20',golfers),/missing from directory/);
});
test('surfaces Supabase RPC errors rather than claiming a saved RSVP',async()=>{
 const db={from(){},rpc(){return Promise.resolve({error:new Error('Permission denied')})}};
 await assert.rejects(rsvp.submit(db,'event-20',4,'playing'),/Permission denied/);
});

test('clear RSVP uses authenticated RPC and never deletes golfer association',async()=>{
 const db=fakeDb();
 await rsvp.clear(db,'event-20');
 assert.deepEqual(db.calls,[{name:'elleng_clear_event_rsvp',args:{p_tournament_id:'event-20'}}]);
 await assert.rejects(rsvp.clear(db,'  '),/Tournament ID is required/);
 assert.equal(db.calls.length,1);
});
test('cleared RSVP is not draft eligible',()=>{
 const golfers=Array.from({length:3},(_,i)=>({name:'Golfer '+i}));
 assert.deepEqual(rsvp.approvedGolferIndices([
  {tournament_id:'nov20',user_id:'cleared',golfer_index:1,status:'out',approval_status:'pending'},
  {tournament_id:'nov20',user_id:'playing',golfer_index:2,status:'playing',approval_status:'approved'}
 ],'nov20',golfers),[2]);
});

test('attendance counts use event RPC rather than visible player rows',async()=>{
 const db=fakeDb();
 const result=await rsvp.counts(db,'nov20');
 assert.deepEqual(db.calls,[{name:'elleng_event_rsvp_counts',args:{p_tournament_id:'nov20'}}]);
 assert.deepEqual(result,{ok:true});
});
test('attendance counts unwrap PostgREST table-returning arrays',async()=>{
 const db={from(){},rpc(){return Promise.resolve({data:[{playing:3,maybe:2,out_count:1,approved_playing:2}],error:null})}};
 assert.deepEqual(await rsvp.counts(db,'nov20'),{playing:3,maybe:2,out_count:1,approved_playing:2});
});

test('attendance totals fail closed on database errors',async()=>{
 const failure=new Error('permission denied');
 const db={from(){},rpc(){return Promise.resolve({data:null,error:failure})}};
 await assert.rejects(rsvp.counts(db,'nov20'),/permission denied/);
});
test('attendance totals reject missing tournament ID before database call',async()=>{
 const db=fakeDb();
 await assert.rejects(rsvp.counts(db,'  '),/Tournament ID is required/);
 assert.deepEqual(db.calls,[]);
});
