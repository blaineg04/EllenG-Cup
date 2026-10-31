import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
import {createHandler,validSubscription} from './core.mjs';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=async(q:any)=>{const{data,error}=await q;if(error)throw Error('Database operation failed');return data};
const rpc=(name:string,args:any)=>checked(admin.rpc(name,args));
const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('reset-alerts:'+s))),b=>b.toString(16).padStart(2,'0')).join('');
const owner=async()=>(await checked(admin.from('elleng_drafts').select('owner_id').eq('id','elleng-cup').single())).owner_id;
async function keys(){
 let row=await checked(admin.from('elleng_reset_push_keys').select('public_key,private_key').eq('id',1).maybeSingle());
 if(!row){const key=webpush.generateVAPIDKeys();await checked(admin.from('elleng_reset_push_keys').upsert({id:1,public_key:key.publicKey,private_key:key.privateKey},{onConflict:'id',ignoreDuplicates:true}));row=await checked(admin.from('elleng_reset_push_keys').select('public_key,private_key').eq('id',1).single())}
 return row;
}
async function send(ownerId:string,title:string,body:string){
 const rows=await checked(admin.from('elleng_reset_push_devices').select('endpoint,subscription').eq('owner_id',ownerId));if(!rows.length)return{accepted:0,devices:0};
 const k=await keys();let accepted=0;
 await Promise.all(rows.map(async(row:any)=>{
  if(!validSubscription(row.subscription))return;
  try{await webpush.sendNotification(row.subscription,JSON.stringify({title,body,url:'/commissioner-reset-requests',tag:'elleng-password-reset'}),{vapidDetails:{subject:'https://elleng-cup.vercel.app',publicKey:k.public_key,privateKey:k.private_key},TTL:3600,urgency:'normal',timeout:10000});accepted++}
  catch(e){if([404,410].includes(Number((e as any)?.statusCode)))await checked(admin.from('elleng_reset_push_devices').delete().eq('endpoint',row.endpoint).eq('owner_id',ownerId))}
 }));return{accepted,devices:rows.length};
}
Deno.serve(createHandler({
 background:(task:Promise<unknown>)=>EdgeRuntime.waitUntil(task),
 gate:async(scope:string,max:number,seconds:number)=>rpc('elleng_recovery_gate',{p_key:await digest(scope),p_maximum:max,p_seconds:seconds}),
 user:async(bearer:string)=>{if(!/^Bearer\s+\S+$/i.test(bearer))return null;const{data,error}=await admin.auth.getUser(bearer.replace(/^Bearer\s+/i,''));return error?null:data.user},owner,
 find:(username:string)=>checked(admin.from('elleng_player_accounts').select('user_id,username,golfer_index').eq('draft_id','elleng-cup').eq('username',username).maybeSingle()),
 queue:(a:any)=>rpc('elleng_queue_reset_request',{p_user:a.user_id,p_username:a.username}),
 notify:async(id:string)=>{
  const r=await checked(admin.from('elleng_reset_requests').select('username').eq('id',id).single());
  const outcome=await send(await owner(),'EllenG Cup password reset',r.username+' requested a password reset. Open your commissioner reset list.');
  await checked(admin.from('elleng_reset_requests').update({push_state:outcome.accepted?'accepted':outcome.devices?'failed':'unavailable'}).eq('id',id));
 },
 list:async()=>{
  const rows=await checked(admin.from('elleng_reset_requests').select('id,user_id,username,created_at,status,push_state,claimed_at').in('status',['pending','processing']).order('created_at',{ascending:true}).limit(100));
  const draft=await checked(admin.from('elleng_drafts').select('state').eq('id','elleng-cup').single());
  const links=await checked(admin.from('elleng_player_accounts').select('user_id,golfer_index,username').eq('draft_id','elleng-cup'));
  return rows.map((r:any)=>{const a=links.find((a:any)=>a.user_id===r.user_id);return{id:r.id,username:r.username,name:a?draft.state?.golfers?.[a.golfer_index]?.name||r.username:r.username,created_at:r.created_at,status:r.status,push_state:r.push_state,retry_after:r.claimed_at?new Date(Date.parse(r.claimed_at)+300000).toISOString():null}});
 },
 pushStatus:async(uid:string)=>{const k=await keys();const rows=await checked(admin.from('elleng_reset_push_devices').select('endpoint').eq('owner_id',uid));return{publicKey:k.public_key,devices:rows.length}},
 subscribe:(uid:string,s:any)=>rpc('elleng_save_reset_push_device',{p_owner:uid,p_subscription:{endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}}}),
 unsubscribe:async(uid:string,endpoint:string)=>{await checked(admin.from('elleng_reset_push_devices').delete().eq('owner_id',uid).eq('endpoint',endpoint))},
 testPush:async(uid:string)=>{const r=await send(uid,'EllenG Cup alerts are connected','This is your test notification. Password reset requests will appear here.');return{accepted:r.accepted,message:r.accepted?'Test accepted by the push service. Check your device for the notification.':'No notification was accepted. Enable alerts on this device and try again.'}},
 claim:(id:string)=>rpc('elleng_claim_reset_request',{p_id:id}),
 reset:async(uid:string,password:string)=>{
  const link=await checked(admin.from('elleng_player_accounts').select('user_id').eq('draft_id','elleng-cup').eq('user_id',uid).single());if(!link)throw Error('Unlinked account');
  // Set first-login enforcement before changing the Auth password; never clear it on failure.
  await checked(admin.from('elleng_player_accounts').update({must_change_password:true,updated_at:new Date().toISOString()}).eq('draft_id','elleng-cup').eq('user_id',uid));
  const{error}=await admin.auth.admin.updateUserById(uid,{password});if(error)throw Error('Auth update failed');
 },
 finish:async(c:any)=>{await checked(admin.from('elleng_reset_requests').update({status:'resolved',closed_at:new Date().toISOString(),claim_token:null}).eq('id',c.id).eq('claim_token',c.claim_token))},
 release:async(c:any)=>{await checked(admin.from('elleng_reset_requests').update({status:'pending',claim_token:null,claimed_at:null}).eq('id',c.id).eq('claim_token',c.claim_token))},
 dismiss:async(id:string)=>{await checked(admin.from('elleng_reset_requests').update({status:'dismissed',closed_at:new Date().toISOString()}).eq('id',id).eq('status','pending'))}
}));
