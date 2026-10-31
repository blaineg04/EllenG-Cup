const ORIGIN='https://elleng-cup.vercel.app';
const H={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
const GENERIC={message:'If that username belongs to an EllenG golfer account, your request is now in the commissioner’s reset list. Submitting a request does not change your password.'};
export function validSubscription(s){
 try{const u=new URL(s.endpoint);return typeof s.endpoint==='string'&&s.endpoint.length<=2048&&u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&!u.hash&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.apple.com'))&&/^[A-Za-z0-9_-]{87}$/.test(s.keys?.p256dh)&&/^[A-Za-z0-9_-]{22}$/.test(s.keys?.auth)}catch{return false}
}
export function createHandler(d){
 const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:H});
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:H});
  if(req.method!=='POST')return reply({error:'Use POST.'},405);
  if(req.headers.get('Origin')&&req.headers.get('Origin')!==ORIGIN)return reply({error:'Origin not allowed.'},403);
  let b;try{const s=await req.text();if(s.length>8192)return reply({error:'Request too large.'},413);b=JSON.parse(s);if(!b||typeof b!=='object'||Array.isArray(b))throw Error()}catch{return reply({error:'Invalid request.'},400)}
  if(b.action==='request'){
   const work=async()=>{try{
    const username=typeof b.username==='string'?b.username.trim().toLowerCase():'';
    if(!/^[a-z0-9]{2,40}$/.test(username)||!await d.gate('requests-global',120,60)||!await d.gate('username:'+username,1,300))return;
    const account=await d.find(username);if(!account)return;
    const item=await d.queue(account);if(item?.fresh)try{await d.notify(item.id)}catch{/* Queue remains available if push delivery fails. */}
   }catch{/* Never expose whether a username exists. */}};
   if(d.background)d.background(work());else await work();return reply(GENERIC);
  }
  try{
   const user=await d.user(req.headers.get('Authorization')||'');if(!user)return reply({error:'Commissioner sign-in required.'},401);
   if(await d.owner()!==user.id)return reply({error:'Commissioner access required.'},403);
   if(b.action==='list')return reply({requests:await d.list()});
   if(b.action==='push_status')return reply(await d.pushStatus(user.id));
   if(b.action==='subscribe'){
    if(!validSubscription(b.subscription))return reply({error:'Unsupported notification subscription.'},400);
    await d.subscribe(user.id,b.subscription);return reply({message:'Phone alerts enabled on this device.'});
   }
   if(b.action==='unsubscribe'){
    if(typeof b.endpoint!=='string'||b.endpoint.length>2048)return reply({error:'Invalid subscription.'},400);
    await d.unsubscribe(user.id,b.endpoint);return reply({message:'Phone alerts disabled on this device.'});
   }
   if(b.action==='test_push'){
    if(!await d.gate('test-push:'+user.id,3,300))return reply({error:'Please wait before sending another test.'},429);
    return reply(await d.testPush(user.id));
   }
   if(!['reset','dismiss'].includes(b.action)||typeof b.id!=='string'||b.id.length>80)return reply({error:'Invalid action or request.'},400);
   if(b.action==='dismiss'){await d.dismiss(b.id);return reply({message:'Request dismissed.'})}
   if(typeof b.password!=='string'||b.password.length<8||b.password.length>1024)return reply({error:'Use a temporary password of at least 8 characters.'},400);
   const claim=await d.claim(b.id);if(!claim)return reply({error:'This request is already being processed or was closed. Refresh the list.'},409);
   try{
    // The linked user is resolved again by the adapter; caller cannot choose a target.
    await d.reset(claim.user_id,b.password);await d.finish(claim);
   }catch{await d.release(claim);return reply({error:'The reset could not be confirmed. The request stays open; retry after checking the account.'},503)}
   return reply({message:'Password reset. Share the temporary password privately with the verified golfer. They must choose a new password when signing in.'});
  }catch{return reply({error:'Unable to complete the request. Try again later.'},503)}
 };
}
