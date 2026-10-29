// Authenticated two-session Supabase scoring preflight.
// NO writes: tests sign-in, user identity, and required RPC discoverability.
// Requires an isolated project; deliberately rejects EllenG production.
const assert=require('node:assert/strict');
const { URL }=require('node:url');
const env=process.env;
const LIVE_REF='xepccqedhbucpbwuykoc';
async function main(){
 const required=['ELLENG_TEST_SUPABASE_URL','ELLENG_TEST_SUPABASE_KEY','ELLENG_TEST_CAPTAIN_EMAIL','ELLENG_TEST_CAPTAIN_PASSWORD','ELLENG_TEST_SECOND_EMAIL','ELLENG_TEST_SECOND_PASSWORD'];
 const absent=required.filter(x=>!env[x]);
 if(absent.length)throw new Error('Isolated integration environment not configured: '+absent.join(', '));
 const url=new URL(env.ELLENG_TEST_SUPABASE_URL);
 if(url.protocol!=='https:'||!/^([a-z0-9]+)\.supabase\.co$/.test(url.hostname)||url.hostname===LIVE_REF+'.supabase.co'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)
  throw new Error('Refusing non-isolated or invalid Supabase integration host');
 if(env.ELLENG_TEST_SUPABASE_KEY.startsWith('sb_secret_')||env.ELLENG_TEST_SUPABASE_KEY.startsWith('sb_service_'))
  throw new Error('Do not use a privileged Supabase key for browser-equivalent tests');
 const base=url.origin,apikey=env.ELLENG_TEST_SUPABASE_KEY;
 async function login(email,password){
  const response=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if(!response.ok)throw new Error('Test account authentication failed (HTTP '+response.status+')');
  const session=await response.json();
  assert.ok(session.access_token,'No access token');
  const identity=await fetch(base+'/auth/v1/user',{headers:{apikey,Authorization:'Bearer '+session.access_token}});
  if(!identity.ok)throw new Error('Authenticated user lookup failed (HTTP '+identity.status+')');
  const user=await identity.json();
  assert.ok(user.id,'Missing authenticated user identity');
  return {id:user.id,token:session.access_token};
 }
 const a=await login(env.ELLENG_TEST_CAPTAIN_EMAIL,env.ELLENG_TEST_CAPTAIN_PASSWORD);
 const b=await login(env.ELLENG_TEST_SECOND_EMAIL,env.ELLENG_TEST_SECOND_PASSWORD);
 assert.notEqual(a.id,b.id,'Two distinct test identities required');
 // Check whether RPC signatures are exposed through PostgREST without invoking a write.
 const schema=await fetch(base+'/rest/v1/',{headers:{apikey,Authorization:'Bearer '+a.token}});
 if(!schema.ok)throw new Error('Authenticated Data API discovery failed (HTTP '+schema.status+')');
 const spec=await schema.json();
 for(const fn of ['elleng_test_authorized_split_pair','elleng_test_authorized_shamble'])
  assert.ok(spec.paths?.['/rpc/'+fn],'Test project missing API RPC: '+fn);
 console.log('PASS: isolated Supabase Auth supports two distinct accounts and exposes both scoring RPCs (read-only).');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
