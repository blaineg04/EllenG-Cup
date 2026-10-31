(async function(){
 'use strict';
 // Opening another email link in this tab may be a fragment-only navigation.
 // Reload so the new credential is read and removed by the same startup flow.
 addEventListener('hashchange',()=>{if(location.hash)location.reload()});
 const $=id=>document.getElementById(id),show=id=>$(id).classList.remove('hidden'),hide=id=>$(id).classList.add('hidden');
 const result=text=>{$('resultText').textContent=text;show('result');$('result').scrollIntoView({block:'nearest',behavior:'smooth'})};
 const cfg=window.ELLENG_CONFIG;
 // Fragment credentials never enter request URLs, referrers or persistent storage.
 const fragment=new URLSearchParams(location.hash.slice(1));let verify=fragment.get('verify'),recovery=fragment.get('recovery');
 if(location.hash)history.replaceState(null,'',location.pathname+location.search);
 if(!cfg||!window.supabase){hide('loading');show('unavailable');return}
 const key=cfg.supabasePublishableKey||cfg.supabaseAnonKey;
 const app=window.supabase.createClient(cfg.supabaseUrl,key,{auth:{detectSessionInUrl:false}});
 const reset=window.supabase.createClient(cfg.supabaseUrl,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'elleng-password-recovery'}});
 const api=async(body,token)=>{
  const res=await fetch(cfg.supabaseUrl+'/functions/v1/account-recovery',{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
  const data=await res.json();if(!res.ok)throw Error(data.error||'Unable to complete this request.');return data;
 };
 const busy=async(button,work)=>{if(button.disabled)return;button.disabled=true;hide('result');try{await work()}catch(e){result(e.message||'Please try again later.')}finally{button.disabled=false}};
 let session=null,resetReady=false;
 const updateStatus=async()=>{
  const status=await api({action:'status'},session.access_token);
  $('emailStatus').textContent=(status.verified_email?'Verified: '+status.verified_email:'No verified recovery email yet.')+(status.pending_email?'\nAwaiting confirmation: '+status.pending_email:'');
 };
 $('requestForm').addEventListener('submit',e=>{e.preventDefault();busy(e.submitter,async()=>{
  const data=await api({action:'request',email:$('requestEmail').value});result(data.message);
 })});
 $('enrollForm').addEventListener('submit',e=>{e.preventDefault();busy(e.submitter,async()=>{
  let password=$('currentPassword').value;$('currentPassword').value='';
  try{const data=await api({action:'enroll',email:$('recoveryEmail').value,password},session.access_token);result(data.message);await updateStatus()}finally{password=''}
 })});
 $('verifyButton').addEventListener('click',e=>busy(e.currentTarget,async()=>{
  const data=await api({action:'confirm',token:verify});verify=null;hide('verifyPanel');result(data.message);
 }));
 $('continueButton').addEventListener('click',e=>busy(e.currentTarget,async()=>{
  if(!recovery)throw Error('Open a new reset link from your email.');
  const {data,error}=await reset.auth.verifyOtp({type:'recovery',token_hash:recovery});recovery=null;
  if(error||!data.session){hide('resetStart');show('requestPanel');throw Error('This reset link is invalid or expired. Request a new one below.')}
  resetReady=true;hide('resetStart');show('resetPanel');$('newPassword').focus();
 }));
 $('resetForm').addEventListener('submit',e=>{e.preventDefault();busy(e.submitter,async()=>{
  if(!resetReady)throw Error('Open a new reset link from your email.');
  const password=$('newPassword').value;if(password.length<8)throw Error('Use at least 8 characters.');
  if(password!==$('confirmPassword').value)throw Error('The passwords do not match.');
  const {error}=await reset.auth.updateUser({password});if(error)throw Error('The password could not be updated. Try a different password or request a new reset link.');
  // This flag only controls the first-login prompt; password security is handled by Auth.
  await reset.functions.invoke('player-profile',{body:{action:'password_changed',draft_id:'elleng-cup'}}).catch(()=>{});
  await reset.auth.signOut({scope:'local'});resetReady=false;$('resetForm').reset();hide('resetPanel');result('Password updated. Return to EllenG Cup and sign in with your usual username and new password.');
 })});
 try{
  const capabilities=await api({action:'capabilities'});hide('loading');
  if(!capabilities.enabled){show('unavailable');return}
  if(verify){show('verifyPanel');return}if(recovery){show('resetStart');return}
  if(new URLSearchParams(location.search).get('mode')==='manage'){
   const {data}=await app.auth.getSession();session=data.session;
   if(!session){result('Sign in to your golfer account first, then open Recovery Email from My Golf.');return}
   await updateStatus();show('managePanel');
  }else show('requestPanel');
 }catch{hide('loading');show('unavailable')}
})();
