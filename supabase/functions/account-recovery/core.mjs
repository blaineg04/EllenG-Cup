// Privileged operations live behind this handler; no credentials or tokens are logged.
const ORIGIN='https://elleng-cup.vercel.app';
const GENERIC={message:'If that address is verified for an EllenG golfer account, a reset link will arrive shortly. Check spam too. Otherwise ask the commissioner to reset your password.'};
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const emailOf=value=>{
 const email=typeof value==='string'?value.trim().toLowerCase():'';
 return email.length<=254&&/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)&&!email.endsWith('@players.ellengcup.app')?email:null;
};
export function createRecoveryHandler(d){
 const digest=async value=>Array.from(new Uint8Array(await d.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 const gate=async(scope,subject,max,seconds)=>d.store.gate(await digest(scope+':'+subject),max,seconds);
 const sendGate=async(subject)=>await gate('email-minute',subject,1,60)&&await gate('email-hour',subject,5,3600)&&await gate('mail-day','global',200,86400);
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return reply({error:'Use POST.'},405);
  if(req.headers.get('Origin')&&req.headers.get('Origin')!==ORIGIN)return reply({error:'Origin not allowed.'},403);
  let body;try{const text=await req.text();if(text.length>4096)return reply({error:'Request too large.'},413);body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{return reply({error:'Invalid request.'},400)}
  if(body.action==='capabilities')return reply({enabled:!!d.enabled});
  if(!d.enabled)return reply({error:'Email recovery is not available yet. Please ask the commissioner for a password reset.'},503);
  try{
   if(body.action==='request'){
    // Identical public reply for missing account, throttling and provider errors.
    const deliver=async()=>{try{
     const email=emailOf(body.email);
     if(email&&await gate('request-minute','global',120,60)){
      const row=await d.store.find(email);
      if(row&&await d.store.linked(row.user_id)&&await sendGate(email)){
       const user=await d.auth.byId(row.user_id);
       if(user?.email&&user.id===row.user_id){
        const token=await d.auth.link(user.email);
        if(token)await d.send(email,'Reset your EllenG Cup password',ORIGIN+'/account-recovery.html#recovery='+encodeURIComponent(token));
       }
      }
     }
    }catch{/* Public requests never expose account or provider details. */}};
    // The production runtime retains the task after returning the same immediate
    // response, so account existence is not disclosed by provider/lookup latency.
    if(d.background)d.background(deliver());else await deliver();
    return reply(GENERIC);
   }
   if(body.action==='confirm'){
    if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return reply({error:'Invalid or expired confirmation link.'},400);
    if(!await gate('confirm-minute','global',120,60))return reply({error:'Please wait a minute and try again.'},429);
    const ok=await d.store.confirm(await digest(body.token));
    return ok?reply({message:'Recovery email verified. You can now use Forgot password with this email.'}):reply({error:'Invalid or expired confirmation link. Sign in and request a new one.'},400);
   }
   if(!['status','enroll'].includes(body.action))return reply({error:'Unknown action.'},400);
   const bearer=req.headers.get('Authorization')||'';
   const user=await d.auth.user(bearer);
   if(!user?.id)return reply({error:'Sign in to your golfer account first.'},401);
   if(!await d.store.linked(user.id))return reply({error:'This login is not linked to a golfer account.'},403);
   if(body.action==='status')return reply(await d.store.status(user.id));
   const email=emailOf(body.email);
   if(!email||typeof body.password!=='string'||!body.password||body.password.length>1024)return reply({error:'Enter a real recovery email and your current password.'},400);
   if(!await gate('enroll-hour',user.id,5,3600))return reply({error:'Too many attempts. Try again in an hour.'},429);
   if(!user.email||!await d.auth.reauth(user.email,body.password))return reply({error:'Your current password was not accepted.'},403);
   if(!await sendGate(email))return reply({error:'Please wait before requesting another email.'},429);
   const token=Array.from(d.crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
   const hash=await digest(token);
   await d.store.pending(user.id,email,hash);
   try{await d.send(email,'Verify your EllenG Cup recovery email',ORIGIN+'/account-recovery.html#verify='+token)}catch{
    await d.store.discard(user.id,hash);return reply({error:'The email could not be sent. Please try again later. Your verified recovery email has not changed.'},503);
   }
   return reply({message:'Check your email and open the confirmation link within 30 minutes. Your existing recovery email remains active until you confirm the new one.'});
  }catch{return reply({error:'Unable to complete this request. Please try again later.'},503)}
 };
}
