(async()=>{
 'use strict';const $=id=>document.getElementById(id),show=id=>$(id).classList.remove('hidden'),hide=id=>$(id).classList.add('hidden');
 const say=text=>{$('status').textContent=text;show('message')},cfg=window.ELLENG_CONFIG;
 if(!cfg||!window.supabase){hide('loading');show('denied');return}
 const key=cfg.supabasePublishableKey||cfg.supabaseAnonKey,db=window.supabase.createClient(cfg.supabaseUrl,key);let publicKey=null,pushSupported=false,editing=false;
 const api=async body=>{const{data}=await db.auth.getSession();if(!data.session)throw Error('Sign in as commissioner first.');const r=await fetch(cfg.supabaseUrl+'/functions/v1/reset-requests',{method:'POST',headers:{apikey:key,'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(body)});const x=await r.json();if(!r.ok)throw Error(x.error||'Request failed.');return x};
 const busy=async(button,fn)=>{if(button.disabled)return;button.disabled=true;hide('message');try{await fn()}catch(e){say(e.message||'Please try again later.')}finally{button.disabled=false}};
 function el(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n}
 async function refresh(){
  if(editing)return;
  const data=await api({action:'list'});if(editing)return;$('count').textContent=String(data.requests.length);const list=$('requests');list.replaceChildren();
  if(!data.requests.length){list.append(el('p','No pending password reset requests.'));return}
  for(const r of data.requests){
   const card=el('article');card.className='request';card.append(el('h3',r.name),el('p','Username: '+r.username));
   const when=el('p','Requested '+new Date(r.created_at).toLocaleString());when.className='muted';card.append(when);
   if(r.status==='processing'&&(!r.retry_after||Date.parse(r.retry_after)>Date.now())){card.append(el('p','Reset is being processed. Retry will be available after '+new Date(r.retry_after).toLocaleTimeString()+'.'));list.append(card);continue}
   const button=el('button','Reset Password'),dismiss=el('button','Dismiss');button.className='primary';card.append(button,dismiss);
   const form=el('form');form.className='hidden';const label=el('label','Temporary password (at least 8 characters)'),input=el('input');input.type='password';input.minLength=8;input.maxLength=1024;input.autocomplete='new-password';input.required=true;label.append(input);const submit=el('button','Confirm Reset');submit.type='submit';submit.className='primary';form.append(label,submit);card.append(form);
   button.addEventListener('click',()=>{if(editing&&form.classList.contains('hidden')){say('Finish or close the open reset form first.');return}form.classList.toggle('hidden');editing=!!document.querySelector('.request form:not(.hidden)');if(!form.classList.contains('hidden'))input.focus()});
   dismiss.addEventListener('click',()=>busy(dismiss,async()=>{await api({action:'dismiss',id:r.id});card.remove();editing=!!document.querySelector('.request form:not(.hidden)');await refresh();say('Request dismissed.')}));
   form.addEventListener('submit',e=>{e.preventDefault();busy(submit,async()=>{let password=input.value;input.value='';try{const x=await api({action:'reset',id:r.id,password});editing=false;await refresh();say(x.message)}finally{password=''}})});list.append(card);
  }
 }
 const registration=()=>navigator.serviceWorker.register('./service-worker.js',{scope:'./',updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready);
 const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
 async function pushState(){
  const x=await api({action:'push_status'});publicKey=x.publicKey;
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const standalone=!!navigator.standalone||matchMedia('(display-mode: standalone)').matches;
  if(ios&&!standalone){show('installHelp');$('pushStatus').textContent='Add the app to your Home Screen to enable iPhone alerts.';return}
  pushSupported='serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
  if(!pushSupported){$('pushStatus').textContent='This browser does not support phone alerts. Requests still appear below.';return}
  $('pushStatus').textContent=Notification.permission==='denied'?'Notifications are blocked. Allow them in your device’s notification settings.':x.devices+' device(s) registered. Enable alerts on each device you want to notify.';
  $('enablePush').disabled=Notification.permission==='denied';$('testPush').disabled=false;$('disablePush').disabled=false;
 }
 $('enablePush').addEventListener('click',e=>{
  if(!pushSupported||!publicKey)return;
  // Permission must be requested directly from this user gesture on iOS.
  const permission=Notification.requestPermission();busy(e.currentTarget,async()=>{
   if(await permission!=='granted')throw Error('Notification permission was not granted. Requests remain in your dashboard.');
   const reg=await registration();let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)});
   const x=await api({action:'subscribe',subscription:sub.toJSON()});say(x.message);await pushState();
  });
 });
 $('disablePush').addEventListener('click',e=>busy(e.currentTarget,async()=>{const reg=await registration(),sub=await reg.pushManager.getSubscription();if(sub){await api({action:'unsubscribe',endpoint:sub.endpoint});await sub.unsubscribe()}say('Phone alerts disabled on this device.');await pushState()}));
 $('testPush').addEventListener('click',e=>busy(e.currentTarget,async()=>say((await api({action:'test_push'})).message)));
 $('refresh').addEventListener('click',e=>busy(e.currentTarget,refresh));
 try{await refresh();hide('loading');show('content')}catch{hide('loading');show('denied');return}
 try{await pushState()}catch{$('pushStatus').textContent='Phone alerts could not be initialized. Your reset request list still works. Reload this page to try phone setup again.'}
 setInterval(()=>{if(!document.hidden)refresh().catch(()=>{})},30000);
})();
