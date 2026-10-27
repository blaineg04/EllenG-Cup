const test=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../../event-rsvp-rollout.js');
function legacy(){
 const calls=[];
 return {calls,load:async()=>{calls.push('load');return ['legacy']},
 submit:async status=>{calls.push(status);return status},
 clear:async()=>{calls.push('clear');return 'cleared'}};
}
test('defaults to legacy RSVP without accessing new database',async()=>{
 const old=legacy();
 const controller=create({legacy:old});
 assert.equal(controller.mode,'legacy');
 assert.deepEqual(await controller.load(),['legacy']);
 await controller.submit('playing');
 await controller.clear();
 assert.deepEqual(old.calls,['load','playing','clear']);
});
test('explicit event rollout calls only event-scoped APIs',async()=>{
 const old=legacy();
 const calls=[];
 const db={
  from(table){calls.push(table);return {select(){return {eq(field,value){calls.push([field,value]);return Promise.resolve({data:[],error:null})}}}}},
  rpc(name,args){calls.push([name,args]);return Promise.resolve({data:{ok:true},error:null})}
 };
 const controller=create({legacy:old,eventMode:true,db,tournamentId:'nov20',verifiedGolferIndex:4});
 await controller.load();
 await controller.submit('playing');
 await controller.clear();
 assert.equal(controller.mode,'event');
 assert.deepEqual(old.calls,[]);
 assert.deepEqual(calls[0],'elleng_event_rsvps');
 assert.deepEqual(calls[1],['tournament_id','nov20']);
 assert.deepEqual(calls[2][0],'elleng_submit_event_rsvp');
 assert.deepEqual(calls[3][0],'elleng_clear_event_rsvp');
});
test('event RPC failure never falls back to legacy mutation',async()=>{
 const old=legacy();
 const db={from(){},rpc(){return Promise.resolve({error:new Error('RLS blocked')})}};
 const controller=create({legacy:old,eventMode:true,db,tournamentId:'nov20',verifiedGolferIndex:4});
 await assert.rejects(controller.submit('playing'),/RLS blocked/);
 assert.deepEqual(old.calls,[]);
});
test('invalid rollout configuration fails before writes',()=>{
 assert.throws(()=>create({legacy:legacy(),eventMode:true}),/requires database/);
});

test('legacy mode never queries event attendance counts',async()=>{
 const controller=create({legacy:legacy()});
 assert.equal(await controller.counts(),null);
});
test('event mode reads secure counts without legacy fallback',async()=>{
 const old=legacy();
 const calls=[];
 const db={from(){},rpc(name,args){calls.push([name,args]);return Promise.resolve({data:[{playing:4,maybe:1,out_count:2,approved_playing:3}],error:null})}};
 const controller=create({legacy:old,eventMode:true,db,tournamentId:'nov20',verifiedGolferIndex:4});
 assert.deepEqual(await controller.counts(),{playing:4,maybe:1,out_count:2,approved_playing:3});
 assert.deepEqual(calls,[['elleng_event_rsvp_counts',{p_tournament_id:'nov20'}]]);
 assert.deepEqual(old.calls,[]);
});
