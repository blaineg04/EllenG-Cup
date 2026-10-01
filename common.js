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

/*
 Exact roster capacity from the actual draft order.
 This works for any team count / golfer count combination, including uneven totals.
 Example: 27 golfers / 7 snake-draft teams => [3,4,4,4,4,4,4].
*/
function teamCapacity(teamIndex){
  const total=totalPicks();
  let count=0;
  for(let n=0;n<total;n++) if(order(n)===teamIndex) count++;
  return count;
}

function teamABCount(teamIndex){
  return (S.teams?.[teamIndex]?.roster||[]).reduce((n,i)=>n+(["A","B"].includes(S.golfers?.[i]?.band)?1:0),0);
}

/*
 Draft balance penalty.
 0 = fully eligible under the normal rank + A/B balancing rules.
 If no remaining golfer has penalty 0, the lowest-penalty remaining rank is allowed.
 This preserves the normal balancing rule but prevents an uneven player/rank mix from
 creating a dead-end where the team on the clock has no legal selection.
*/
function bandPenalty(t,b){
  if(!bands.includes(b)||!S.teams?.[t]) return Number.POSITIVE_INFINITY;
  const bandMin=Math.min(...S.teams.map((_,i)=>tbc(i,b)));
  let penalty=tbc(t,b)-bandMin;
  if(b==="A"||b==="B"){
    const abMin=Math.min(...S.teams.map((_,i)=>teamABCount(i)));
    penalty+=teamABCount(t)-abMin;
  }
  return penalty;
}
function canBand(t,b){
  if(!bands.includes(b)||!S.teams?.[t])return false;
  const remainingBands=[...new Set(S.golfers.filter(g=>g?.name&&g.team==null&&bands.includes(g.band)).map(g=>g.band))];
  if(!remainingBands.length)return false;
  const best=Math.min(...remainingBands.map(rb=>bandPenalty(t,rb)));
  return bandPenalty(t,b)===best;
}

async function load(){let {data,error}=await db.from("elleng_drafts").select("state").eq("id",cfg.draftId).single();if(error)throw error;S={...fresh(),...data.state};return S}
async function save(){let {error}=await db.from("elleng_drafts").upsert({id:cfg.draftId,state:S,updated_at:new Date().toISOString()});if(error)throw error}
function subscribe(cb){return db.channel("elleng-"+cfg.draftId).on("postgres_changes",{event:"*",schema:"public",table:"elleng_drafts",filter:"id=eq."+cfg.draftId},async()=>{await load();cb()}).subscribe(st=>{const el=document.getElementById("connection");if(el){el.textContent=st==="SUBSCRIBED"?"LIVE":"CONNECTING";el.className=st==="SUBSCRIBED"?"online":"offline"}})}
function remaining(){if(S.timerPaused||!S.timerEndsAt)return S.timerLength;return Math.max(0,Math.ceil((new Date(S.timerEndsAt)-Date.now())/1000))}
function esc(x){return String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
