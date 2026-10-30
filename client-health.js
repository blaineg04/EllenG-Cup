function createHealthMonitor(env){
 const BUILD='health-20261029-1',KEY='elleng_health_queue_v1';
 const codes=new Set(['script_error','unhandled_rejection','score_save_failed','score_refresh_failed','rsvp_load_failed','draft_sync_failed']);
 const routes=new Set(['scoring','draft','captain','admin']);
 const path=String(env.location?.pathname||'/').split('/').pop().replace(/\.html$/,'');
 const route=routes.has(path)?path:'scoring';
 let memory=[],db=null,pending=null;const recent=new Map();
 function read(){try{const value=JSON.parse(env.localStorage.getItem(KEY)||'[]');if(Array.isArray(value))memory=value.filter(x=>x&&codes.has(x.code)&&routes.has(x.route)&&Number.isFinite(x.at)).slice(-20).map(x=>({code:x.code,route:x.route,at:x.at}));}catch(_){}return memory;}
 function write(q){memory=q.slice(-20);try{env.localStorage.setItem(KEY,JSON.stringify(memory))}catch(_){} }
 async function send(){
  if(!db)return;
  const session=await db.auth.getSession();if(session.error||!session.data?.session?.user)return;
  const batch=read().slice();
  for(const event of batch){
   const {error}=await db.rpc('elleng_report_client_event',{p_code:event.code,p_route:event.route,p_build:BUILD});
   if(error)return;
   const q=read();const i=q.findIndex(x=>x.code===event.code&&x.route===event.route&&x.at===event.at);if(i>=0)q.splice(i,1);write(q);
  }
 }
 function flush(){if(pending)return pending;pending=send().catch(()=>{}).finally(()=>{pending=null});return pending;}
 function report(code){if(!codes.has(code))return false;const q=read(),now=Date.now();if(now-(recent.get(code)||0)<60000||q.some(x=>x.code===code&&x.route===route&&now-x.at<60000))return false;recent.set(code,now);q.push({code,route,at:now});write(q);if(db)void flush();return true;}
 function attach(client){if(db===client)return;db=client;try{db.auth.onAuthStateChange(()=>{env.setTimeout(()=>{void flush()},0)})}catch(_){}void flush();}
 env.addEventListener('error',()=>report('script_error'));
 env.addEventListener('unhandledrejection',()=>report('unhandled_rejection'));
 env.addEventListener('online',()=>{void flush()});
 return {report,attach,flush};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createHealthMonitor};
if(typeof window!=='undefined')window.EllenGHealth=createHealthMonitor(window);
