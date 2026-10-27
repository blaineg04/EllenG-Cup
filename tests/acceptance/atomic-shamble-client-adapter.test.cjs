'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {submitAtomicShambleScore}=require('./atomic-shamble-client-adapter.cjs');
const base={tournamentId:'synthetic',teamIndex:0,hole:10,golferIndex:0,score:3,roster:[0,1]};
test('atomic Shamble adapter performs one RPC, not two browser writes',async()=>{
 let calls=0,name,payload;
 const db={rpc:async(n,p)=>{calls++;name=n;payload=p;return {data:2,error:null}}};
 assert.equal(await submitAtomicShambleScore({...base,db}),2);
 assert.equal(calls,1);assert.equal(name,'elleng_test_save_shamble_score');
 assert.equal(payload.p_score,3);assert.deepEqual(payload.p_roster,[0,1]);
});
test('rejects invalid roster, hole, or score before database access',async()=>{
 let calls=0;const db={rpc:()=>{calls++;throw Error('must not be called')}};
 for(const patch of [{score:''},{score:0},{score:21},{hole:9},{hole:19},{roster:[0,0]},{roster:[1]},{golferIndex:-1}])
  await assert.rejects(submitAtomicShambleScore({...base,...patch,db}));
 assert.equal(calls,0);
});
test('fails closed if atomic RPC is unavailable or returns an error',async()=>{
 await assert.rejects(submitAtomicShambleScore({...base,db:{}}),/unavailable/);
 await assert.rejects(submitAtomicShambleScore({...base,db:{rpc:async()=>({error:{message:'Not authorized'}})}}),/Not authorized/);
});
