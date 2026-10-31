window.EllenGResetRequests={init(db){
 const link=document.getElementById('resetRequestsLink'),count=document.getElementById('resetRequestsCount');if(!link)return;
 let allowed=true,busy=false;
 async function poll(){if(!allowed||busy||document.hidden)return;busy=true;try{
  const{data}=await db.auth.getSession();if(!data.session){link.classList.add('hidden');return}
  const cfg=window.ELLENG_CONFIG,r=await fetch(cfg.supabaseUrl+'/functions/v1/reset-requests',{method:'POST',headers:{apikey:cfg.supabasePublishableKey||cfg.supabaseAnonKey,'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({action:'list'})});
  if(r.status===401||r.status===403){allowed=false;link.classList.add('hidden');return}if(!r.ok)return;
  const x=await r.json();count.textContent=x.requests.length?String(x.requests.length)+' pending':'No pending requests';link.classList.remove('hidden');link.style.border=x.requests.length?'2px solid #e6bc52':'';
 }catch{/* Main scoring remains usable when alerts cannot refresh. */}finally{busy=false}}
 db.auth.onAuthStateChange(()=>{allowed=true;setTimeout(poll,0)});poll();setInterval(poll,60000);
}};
