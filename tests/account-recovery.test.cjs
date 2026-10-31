const {test}=require('node:test');
const assert=require('node:assert/strict');
const webcrypto=require('node:crypto').webcrypto;
test('commissioner request queue replaces unavailable recovery email settings',()=>{
 const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'../scoring.html'),'utf8');
 assert.match(html,/id="resetRequestsLink"/);assert(!html.includes('Recovery email</a>'));
});
async function fixture(overrides={}) {
 const {createRecoveryHandler}=await import('../supabase/functions/account-recovery/core.mjs');
 const calls={mail:[],links:[],pending:[],password:[]};
 const deps={enabled:true,crypto:webcrypto,now:()=>0,
  store:{gate:async()=>true,status:async()=>({verified_email:null,pending_email:null}),linked:async()=>true,find:async()=>({user_id:'u1'}),pending:async(...x)=>calls.pending.push(x),discard:async()=>{},confirm:async()=>true},
  auth:{user:async()=>({id:'u1',email:'bburt@players.ellengcup.app'}),reauth:async(...x)=>{calls.password.push(x);return true},byId:async()=>({id:'u1',email:'bburt@players.ellengcup.app'}),link:async(email)=>{calls.links.push(email);return 'native-hash'}},
  send:async(...x)=>calls.mail.push(x),...overrides};
 const handler=createRecoveryHandler(deps);
 const request=async(body,token='session')=>{
  const res=await handler(new Request('https://example.invalid',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}));
  return {status:res.status,body:await res.json()};
 };
 return {request,calls,deps};
}
test('disabled delivery fails closed without account lookup or email',async()=>{
 const f=await fixture({enabled:false});const r=await f.request({action:'request',email:'golfer@example.com'});
 assert.equal(r.status,503);assert.deepEqual(f.calls.mail,[]);assert.deepEqual(f.calls.links,[]);
});
test('request sends only to verified recovery address and preserves username alias',async()=>{
 const f=await fixture();const r=await f.request({action:'request',email:' Golfer@Example.com '});
 assert.equal(r.status,200);assert.deepEqual(f.calls.links,['bburt@players.ellengcup.app']);
 assert.equal(f.calls.mail[0][0],'golfer@example.com');assert.match(f.calls.mail[0][2],/^https:\/\/elleng-cup.vercel.app\/account-recovery.html#recovery=native-hash$/);
 assert(!JSON.stringify(r.body).includes('native-hash'));
});
test('unknown, unlinked, throttled and mail failures have same public response',async()=>{
 const f=await fixture();const expected=await f.request({action:'request',email:'golfer@example.com'});
 for(const change of ['unknown','unlinked','throttle','mail']) {
  const x=await fixture();if(change==='unknown')x.deps.store.find=async()=>null;
  if(change==='unlinked')x.deps.store.linked=async()=>false;
  if(change==='throttle')x.deps.store.gate=async()=>false;
  if(change==='mail')x.deps.send=async()=>{throw Error('secret provider detail')};
  assert.deepEqual(await x.request({action:'request',email:'golfer@example.com'}),expected);
 }
});
test('enrollment requires own authenticated linked account and current password',async()=>{
 for(const bad of ['user','link','password']){
  const f=await fixture();if(bad==='user')f.deps.auth.user=async()=>null;
  if(bad==='link')f.deps.store.linked=async()=>false;
  if(bad==='password')f.deps.auth.reauth=async()=>false;
  const r=await f.request({action:'enroll',email:'new@example.com',password:'current password',user_id:'victim'});
  assert(r.status>=400);assert.equal(f.calls.pending.length,0);assert.equal(f.calls.mail.length,0);
 }
});
test('enrollment stores only token digest bound to own user and confirms separately',async()=>{
 const f=await fixture();const r=await f.request({action:'enroll',email:'NEW@Example.com',password:'current password'});
 assert.equal(r.status,200);assert.deepEqual(f.calls.password,[['bburt@players.ellengcup.app','current password']]);
 const [uid,email,hash]=f.calls.pending[0];assert.equal(uid,'u1');assert.equal(email,'new@example.com');assert.match(hash,/^[a-f0-9]{64}$/);
 const raw=new URL(f.calls.mail[0][2]).hash.split('=')[1];assert.notEqual(hash,raw);assert.match(raw,/^[a-f0-9]{64}$/);
 assert(!JSON.stringify(r.body).includes(raw));
});
test('invalid alias email, malformed bodies and token lengths never send',async()=>{
 const f=await fixture();for(const email of ['bburt@players.ellengcup.app','x\ny@example.com','not email','a@b']){
  assert.equal((await f.request({action:'enroll',email,password:'pw'})).status,400);
 } assert.equal((await f.request({action:'confirm',token:'tiny'})).status,400);assert.equal(f.calls.mail.length,0);
});
test('expired or replayed confirmation reports failure',async()=>{
 const f=await fixture();let used=false;f.deps.store.confirm=async()=>{if(used)return false;used=true;return true};
 const body={action:'confirm',token:'a'.repeat(64)};assert.equal((await f.request(body)).status,200);assert.equal((await f.request(body)).status,400);
});
test('public capability does not reveal addresses and status requires a session',async()=>{
 const f=await fixture();assert.deepEqual((await f.request({action:'capabilities'})).body,{enabled:true});
 f.deps.auth.user=async()=>null;assert.equal((await f.request({action:'status'})).status,401);
});
test('provider failure discards only new pending token and returns no false success',async()=>{
 const f=await fixture({send:async()=>{throw Error('sensitive provider detail')}});const discarded=[];f.deps.store.discard=async(...args)=>discarded.push(args);
 const r=await f.request({action:'enroll',email:'new@example.com',password:'pw'});
 assert.equal(r.status,503);assert.match(r.body.error,/verified recovery email has not changed/);assert.deepEqual(discarded,[['u1',f.calls.pending[0][2]]]);assert(!JSON.stringify(r).includes('sensitive'));
});
test('production background response does not wait for account lookup or mail',async()=>{
 let finish,task,started;const ready=new Promise(r=>started=r);const f=await fixture({background:p=>{task=p}});f.deps.store.find=()=>new Promise(r=>{finish=r;started()});
 const response=await f.request({action:'request',email:'golfer@example.com'});assert.equal(response.status,200);assert.equal(f.calls.mail.length,0);
 await ready;finish(null);await task;
});
