
const cfg=window.ELLENG_CONFIG;
const db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
const bands=["A","B","C","D"];
function fresh(){
 return {golfers:Array.from({length:24},()=>({name:"",hcp:"",band:"A",team:null})),
 teams:Array.from({length:6},(_,i)=>({name:"Team "+(i+1),captain:"",roster:[]})),
 picks:[],draftType:"snake",timerLength:60,timerEndsAt:null,timerPaused:true};
}
let S=fresh();
function order(n){let r=Math.floor(n/6),p=n%6;return S.draftType==="snake"&&r%2?5-p:p}
function bandCounts(){let c={A:0,B:0,C:0,D:0};S.golfers.forEach(g=>{if(g.name)c[g.band]++});return c}
function tbc(t,b){return S.teams[t].roster.reduce((n,i)=>n+(S.golfers[i]?.band===b),0)}
function canBand(t,b){let c=bandCounts()[b],base=Math.floor(c/6),extra=c%6,m=tbc(t,b);if(m<base)return true;if(m>base)return false;let used=S.teams.filter((_,i)=>i!==t&&tbc(i,b)>base).length;return used<extra}
async function load(){let {data,error}=await db.from("elleng_drafts").select("state").eq("id",cfg.draftId).single();if(error)throw error;S={...fresh(),...data.state};return S}
async function save(){let {error}=await db.from("elleng_drafts").upsert({id:cfg.draftId,state:S,updated_at:new Date().toISOString()});if(error)throw error}
function subscribe(cb){return db.channel("elleng-"+cfg.draftId).on("postgres_changes",{event:"*",schema:"public",table:"elleng_drafts",filter:"id=eq."+cfg.draftId},async()=>{await load();cb()}).subscribe(st=>{const el=document.getElementById("connection");if(el){el.textContent=st==="SUBSCRIBED"?"LIVE":"CONNECTING";el.className=st==="SUBSCRIBED"?"online":"offline"}})}
function remaining(){if(S.timerPaused||!S.timerEndsAt)return S.timerLength;return Math.max(0,Math.ceil((new Date(S.timerEndsAt)-Date.now())/1000))}
function esc(x){return String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
