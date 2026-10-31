const {test}=require('node:test'),assert=require('node:assert/strict');
async function fixture(){
 const {createHandler,validSubscription}=await import('../supabase/functions/reset-requests/core.mjs');
 const calls={queued:0,notify:0,reset:[]};const d={background:null,
  gate:async()=>true,user:async()=>({id:'owner'}),owner:async()=>'owner',
  find:async()=>({user_id:'golfer',username:'bburt',golfer_index:4}),
  queue:async()=>{calls.queued++;return{id:'request-id',fresh:true}},notify:async()=>{calls.notify++},
  list:async()=>[{id:'request-id',username:'bburt',name:'Bobby Burt'}],
  pushStatus:async()=>({publicKey:'public',devices:0}),subscribe:async()=>{},unsubscribe:async()=>{},testPush:async()=>({accepted:1}),
  claim:async()=>({id:'request-id',user_id:'golfer',username:'bburt',claim_token:'claim'}),
  reset:async(...x)=>calls.reset.push(x),finish:async()=>{},release:async()=>{},dismiss:async()=>{}
 };const h=createHandler(d);const request=async(body,method='POST')=>{const r=await h(new Request('https://example.invalid',{method,headers:{'Content-Type':'application/json',Authorization:'Bearer session'},body:method==='POST'?JSON.stringify(body):undefined}));return{status:r.status,data:await r.json()}};
 return{request,calls,d,validSubscription};
}
test('unknown, queued, duplicate and throttled reset requests have identical public replies',async()=>{
 const f=await fixture(),expected=await f.request({action:'request',username:' BBURT '});assert.equal(expected.status,200);assert.equal(f.calls.notify,1);
 for(const mode of ['unknown','duplicate','throttled','failure']){const x=await fixture();if(mode==='unknown')x.d.find=async()=>null;if(mode==='duplicate')x.d.queue=async()=>({id:'old',fresh:false});if(mode==='throttled')x.d.gate=async()=>false;if(mode==='failure')x.d.find=async()=>{throw Error('private details')};assert.deepEqual(await x.request({action:'request',username:'bburt'}),expected);assert.equal(x.calls.notify,0)}
});
test('queue persists even when push fails; no password changes on request',async()=>{
 const f=await fixture();f.d.notify=async()=>{throw Error('push failed')};assert.equal((await f.request({action:'request',username:'bburt'})).status,200);assert.equal(f.calls.queued,1);assert.deepEqual(f.calls.reset,[]);
});
test('all commissioner actions require server verified draft owner',async()=>{
 for(const action of ['list','push_status','subscribe','unsubscribe','test_push','reset','dismiss']){const f=await fixture();f.d.user=async()=>({id:'captain'});assert.equal((await f.request({action,id:'request-id',password:'Valid password'})).status,403);assert.equal(f.calls.reset.length,0)}
 const f=await fixture();f.d.user=async()=>null;assert.equal((await f.request({action:'list'})).status,401);
});
test('reset targets claimed original user ID, never caller supplied username or user',async()=>{
 const f=await fixture();assert.equal((await f.request({action:'reset',id:'request-id',user_id:'victim',username:'victim',password:'New password'})).status,200);assert.deepEqual(f.calls.reset,[['golfer','New password']]);
});
test('missing, previously processed or short-password requests cannot reset users',async()=>{
 const f=await fixture();assert.equal((await f.request({action:'reset',id:'request-id',password:'tiny'})).status,400);f.d.claim=async()=>null;assert.equal((await f.request({action:'reset',id:'request-id',password:'New password'})).status,409);assert.deepEqual(f.calls.reset,[]);
});
test('auth reset failure reopens request and does not report success or leak details',async()=>{
 const f=await fixture();let released=false;f.d.reset=async()=>{throw Error('auth credential internals')};f.d.release=async()=>{released=true};const r=await f.request({action:'reset',id:'request-id',password:'New password'});assert.equal(r.status,503);assert(released);assert(!JSON.stringify(r).includes('internals'));
});
test('push endpoint validation blocks arbitrary server requests and malformed encryption keys',async()=>{
 const {validSubscription:v}=await fixture();const good={endpoint:'https://web.push.apple.com/fixture',keys:{p256dh:'B'+'A'.repeat(86),auth:'A'.repeat(22)}};
 assert(v(good));for(const endpoint of ['http://web.push.apple.com/x','https://127.0.0.1/x','https://web.push.apple.com.evil.test/x','https://evil.test/x','https://web.push.apple.com:444/x','https://x@y.push.apple.com/x'])assert(!v({...good,endpoint}));assert(!v({...good,keys:{p256dh:'x',auth:'x'}}));
});
