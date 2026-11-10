const fs=require('node:fs'),vm=require('node:vm');
async function checkHealth({config,request=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(config.supabaseUrl!=='https://xepccqedhbucpbwuykoc.supabase.co')throw Error('EllenG project mismatch');
 const checks=[];
 const probes=[
  {name:'scoring-page',url:'https://elleng-cup.vercel.app/scoring',accept:(status,text)=>status===200&&['id="loginBtn"','id="playerDirectory"','id="saveSelfScore"'].every(s=>text.includes(s))},
  {name:'auth-service',url:config.supabaseUrl+'/auth/v1/health',accept:(status,text)=>status===200&&validJSON(text)},
  {name:'database-read',url:config.supabaseUrl+'/rest/v1/elleng_tournaments?select=id&id=eq.elleng-cup-live&limit=1',accept:(status,text)=>status===200&&validJSON(text)},
  {name:'score-authorization',url:config.supabaseUrl+'/functions/v1/golfer-handicap',post:true,accept:status=>status===401||status===403}
 ];
 for(const p of probes){let ok=false,status=null,attempts=0;
  while(attempts<3&&!ok){attempts++;
   try{const options={method:p.post?'POST':'GET',headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json'},signal:AbortSignal.timeout(8000),redirect:'error'};
    if(p.post)options.body='{}';if(!p.url.startsWith(config.supabaseUrl))delete options.headers.apikey;
    const response=await request(p.url,options);status=response.status;ok=p.accept(status,(await response.text()).slice(0,1000000));
   }catch(_){status=null}
   if(!ok&&attempts<3)await sleep(attempts*2000);
  }
  checks.push({name:p.name,ok,status,attempts});
 }
 return {checkedAt:new Date().toISOString(),ok:checks.every(c=>c.ok),checks};
}
function validJSON(s){try{JSON.parse(s);return true}catch(_){return false}}
function loadConfig(){const context={window:{}};vm.runInNewContext(fs.readFileSync('config.js','utf8'),context,{timeout:1000});return context.window.ELLENG_CONFIG;}
async function reportIncident(result){
 const token=process.env.GITHUB_TOKEN;if(!token)return;
 if(process.env.GITHUB_REPOSITORY!=='blaineg04/EllenG-Cup'||process.env.GITHUB_REF!=='refs/heads/main')return;
 const base='https://api.github.com/repos/blaineg04/EllenG-Cup';
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
 const call=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Incident notification failed');return r.status===204?null:r.json()};
 const title='EllenG app health incident';const issues=await call('/issues?state=open&per_page=100');
 const incident=issues.find(i=>i.title===title&&i.user?.login==='github-actions[bot]'&&!i.pull_request);
 if(result.ok){if(incident)await call('/issues/'+incident.number,'PATCH',{state:'closed',state_reason:'completed'});return;}
 if(incident)return;
 await call('/issues','POST',{title,body:'Independent checks failed after three attempts.\n\n'+result.checks.filter(c=>!c.ok).map(c=>'- '+c.name+': '+(c.status||'connection/timeout')).join('\n')+'\n\nNo scores or account data were changed. Inspect the workflow and provider status. Never restore data or deploy an untested patch automatically.'});
}
if(require.main===module){checkHealth({config:loadConfig()}).then(async r=>{console.log(JSON.stringify(r));await reportIncident(r);if(!r.ok)process.exitCode=1}).catch(()=>{console.error('Health monitor could not complete; inspect configuration or notifications.');process.exitCode=1});}
module.exports={checkHealth,loadConfig};
