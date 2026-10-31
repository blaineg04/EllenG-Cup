(()=>{
 'use strict';if(location.hash)history.replaceState(null,'',location.pathname+location.search);
 const form=document.getElementById('requestForm'),button=document.getElementById('sendRequest'),status=document.getElementById('resultText');
 form.addEventListener('submit',async e=>{e.preventDefault();if(button.disabled)return;button.disabled=true;status.textContent='Submitting your request…';
  try{const cfg=window.ELLENG_CONFIG,r=await fetch(cfg.supabaseUrl+'/functions/v1/reset-requests',{method:'POST',headers:{apikey:cfg.supabasePublishableKey||cfg.supabaseAnonKey,'Content-Type':'application/json'},body:JSON.stringify({action:'request',username:document.getElementById('requestUsername').value.trim().toLowerCase()})});const x=await r.json();if(!r.ok)throw Error();status.textContent=x.message;form.reset()}
  catch{status.textContent='Your request could not be submitted. Please try again, or contact the commissioner.'}finally{button.disabled=false}
 });
})();
