import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { createRecoveryHandler } from './core.mjs';
const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const apiKey=Deno.env.get('ELLENG_BREVO_API_KEY'),from=Deno.env.get('ELLENG_RECOVERY_FROM_EMAIL');
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=async(q:any)=>{const {data,error}=await q;if(error)throw Error('Database request failed');return data};
const rpc=(name:string,args:any)=>checked(admin.rpc(name,args));
Deno.serve(createRecoveryHandler({
 enabled:Deno.env.get('ELLENG_RECOVERY_ENABLED')==='true'&&!!apiKey&&!!from,
 crypto,
 background:(task:Promise<unknown>)=>EdgeRuntime.waitUntil(task),
 store:{
  gate:(key:string,maximum:number,seconds:number)=>rpc('elleng_recovery_gate',{p_key:key,p_maximum:maximum,p_seconds:seconds}),
  linked:async(uid:string)=>!!(await checked(admin.from('elleng_player_accounts').select('user_id').eq('draft_id','elleng-cup').eq('user_id',uid).maybeSingle())),
  status:async(uid:string)=>{
   const row=await checked(admin.from('elleng_recovery_emails').select('verified_email,pending_email,pending_expires_at').eq('user_id',uid).maybeSingle());
   return {verified_email:row?.verified_email||null,pending_email:row?.pending_expires_at&&Date.parse(row.pending_expires_at)>Date.now()?row.pending_email:null};
  },
  find:(email:string)=>checked(admin.from('elleng_recovery_emails').select('user_id').eq('verified_email',email).maybeSingle()),
  pending:(uid:string,email:string,hash:string)=>rpc('elleng_recovery_pending',{p_user:uid,p_email:email,p_hash:hash}),
  discard:async(uid:string,hash:string)=>{await checked(admin.from('elleng_recovery_emails').update({pending_email:null,pending_hash:null,pending_expires_at:null}).eq('user_id',uid).eq('pending_hash',hash))},
  confirm:(hash:string)=>rpc('elleng_recovery_confirm',{p_hash:hash})
 },
 auth:{
  user:async(bearer:string)=>{
   if(!/^Bearer\s+\S+$/i.test(bearer))return null;
   const {data,error}=await admin.auth.getUser(bearer.replace(/^Bearer\s+/i,''));return error?null:data.user;
  },
  reauth:async(email:string,password:string)=>{
   const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data,error}=await client.auth.signInWithPassword({email,password});
   if(error||!data.session)return false;
   // End only this short-lived reauthentication session, not the golfer's app session.
   await client.auth.signOut({scope:'local'});return true;
  },
  byId:async(uid:string)=>{const {data,error}=await admin.auth.admin.getUserById(uid);if(error)throw Error();return data.user},
  link:async(email:string)=>{const {data,error}=await admin.auth.admin.generateLink({type:'recovery',email});if(error)throw Error();return data.properties?.hashed_token}
 },
 send:async(email:string,subject:string,link:string)=>{
  const res=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':apiKey!,'Content-Type':'application/json',accept:'application/json'},body:JSON.stringify({sender:{name:'EllenG Cup',email:from},to:[{email}],subject,textContent:subject+'\n\nOpen this link and follow the instructions:\n'+link+'\n\nIf you did not request this, ignore this message. Never share this link.',headers:{'X-Mailin-Track-Click':'0','X-Mailin-Track-Open':'0'}}),signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw Error('Email send failed');
 }
}));
