const cfg=window.ELLENG_CONFIG;
const db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
const bands=["A","B","C","D"];
const bandRanges={A:"0–9",B:"10–17",C:"18–25",D:"26+"};
function bandRange(b){return bandRanges[b]||"—"}
function fresh(){
 return {golferCount:24,golfers:Array.from({length:24},()=>({name:"",hcp:"",band:"",team:null})),
 teams:Array.from({length:6},(_,i)=>({name:"Team "+(i+1),captain:"",roster:[]})),
 picks:[],draftType:"snake",timerLength:60,timerEndsAt:null,timerPaused:true,tournamentName:"EllenG Cup",tournamentDate:null};
}
let S=fresh();
function targetGolferCount(){let n=Number(S.golferCount||S.golfers?.length||24);return Math.max(8,Math.min(36,Number.isInteger(n)?n:24))}
function totalPicks(){return targetGolferCount()}
function order(n){let tc=Math.max(1,S.teams.length),r=Math.floor(n/tc),p=n%tc;return S.draftType==="snake"&&r%2?(tc-1)-p:p}
function teamCapacity(t){let n=0;for(let p=0;p<totalPicks();p++)if(order(p)===t)n++;return n}
function bandCounts(){let c={A:0,B:0,C:0,D:0};S.golfers.forEach(g=>{if(g.name&&bands.includes(g.band))c[g.band]++});return c}
function tbc(t,b){return S.teams[t].roster.reduce((n,i)=>n+(S.golfers[i]?.band===b),0)}

/*
 Fair-rank draft rule:
 A team may draft rank A/B/C/D only when its current count of that rank
 is equal to the LOWEST count among all teams.
 Example: a team with 1 A cannot take a second A while any team has 0 A.
 Once every team has 1 A, second A golfers can be selected if any remain.
 The same rule applies independently to B, C and D.
*/
function canBand(t,b){
 if(!bands.includes(b))return false;
 const myCount=tbc(t,b);
 const lowest=Math.min(...S.teams.map((_,i)=>tbc(i,b)));
 return myCount===lowest;
}

async function load(){let {data,error}=await db.from("elleng_drafts").select("state").eq("id",cfg.draftId).single();if(error)throw error;S={...fresh(),...data.state};if(!Array.isArray(S.teams)||!S.teams.length)S.teams=fresh().teams;if(!Array.isArray(S.golfers))S.golfers=[];if(!Array.isArray(S.picks))S.picks=[];S.golferCount=Math.max(8,Math.min(36,Number(S.golferCount||S.golfers.length||24)));while(S.golfers.length<S.golferCount)S.golfers.push({name:"",hcp:"",band:"",team:null});return S}
async function save(){let {error}=await db.from("elleng_drafts").upsert({id:cfg.draftId,state:S,updated_at:new Date().toISOString()});if(error)throw error}
function subscribe(cb){return db.channel("elleng-"+cfg.draftId).on("postgres_changes",{event:"*",schema:"public",table:"elleng_drafts",filter:"id=eq."+cfg.draftId},async()=>{await load();cb()}).subscribe(st=>{const el=document.getElementById("connection");if(el){el.textContent=st==="SUBSCRIBED"?"LIVE":"CONNECTING";el.className=st==="SUBSCRIBED"?"online":"offline"}})}
function remaining(){if(S.timerPaused||!S.timerEndsAt)return S.timerLength;return Math.max(0,Math.ceil((new Date(S.timerEndsAt)-Date.now())/1000))}
function esc(x){return String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
