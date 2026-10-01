const cfg=window.ELLENG_CONFIG;
const supabaseKey=cfg?.supabasePublishableKey||cfg?.supabaseAnonKey;
if(!cfg?.supabaseUrl||!supabaseKey)throw new Error("EllenG Supabase configuration is missing.");
const db=window.supabase.createClient(cfg.supabaseUrl,supabaseKey);
const bands=["A","B","C","D"];
const bandRanges={A:"0–9",B:"10–17",C:"18–25",D:"26+"};
function bandRange(b){return bandRanges[b]||"—"}
function fresh(){
 const teamCount=Number(cfg?.defaultTeamCount||7);
 const golferCount=Number(cfg?.defaultGolferCount||27);
 return {golfers:Array.from({length:golferCount},()=>({name:"",hcp:"",band:"",team:null})),
 teams:Array.from({length:teamCount},(_,i)=>({name:"Team "+(i+1),captain:"",roster:[]})),
 picks:[],draftType:"snake",timerLength:60,timerEndsAt:null,timerPaused:true,tournamentName:"EllenG Cup",tournamentDate:null};
}
let S=fresh();
function order(n){
 const teamCount=Math.max(1,S.teams?.length||Number(cfg?.defaultTeamCount||7));
 let r=Math.floor(n/teamCount),p=n%teamCount;
 return S.draftType==="snake"&&r%2?(teamCount-1-p):p;
}
function bandCounts(){let c={A:0,B:0,C:0,D:0};S.golfers.forEach(g=>{if(g.name&&bands.includes(g.band))c[g.band]++});return c}
function tbc(t,b){return S.teams[t].roster.reduce((n,i)=>n+(S.golfers[i]?.band===b),0)}

function totalPicks(){
  const named=S.golfers.filter(g=>g&&g.name).length;
  return named||S.golfers.length;
}
function teamCapacity(teamIndex){
  const teams=Math.max(1,S.teams.length);
  const total=totalPicks();
  const base=Math.floor(total/teams);
  const extra=total%teams;
  return base+(teamIndex<extra?1:0);
}

/*
 Fair-rank draft rule:
 A team may draft rank A/B/C/D only when its current count of that rank
 is equal to the LOWEST count among all six teams.
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

async function load(){let {data,error}=await db.from("elleng_drafts").select("state").eq("id",cfg.draftId).single();if(error)throw error;S={...fresh(),...data.state};return S}
async function save(){let {error}=await db.from("elleng_drafts").upsert({id:cfg.draftId,state:S,updated_at:new Date().toISOString()});if(error)throw error}
function subscribe(cb){return db.channel("elleng-"+cfg.draftId).on("postgres_changes",{event:"*",schema:"public",table:"elleng_drafts",filter:"id=eq."+cfg.draftId},async()=>{await load();cb()}).subscribe(st=>{const el=document.getElementById("connection");if(el){el.textContent=st==="SUBSCRIBED"?"LIVE":"CONNECTING";el.className=st==="SUBSCRIBED"?"online":"offline"}})}
function remaining(){if(S.timerPaused||!S.timerEndsAt)return S.timerLength;return Math.max(0,Math.ceil((new Date(S.timerEndsAt)-Date.now())/1000))}
function esc(x){return String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
