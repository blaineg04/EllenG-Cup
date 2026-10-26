import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function bandFromHandicap(n:number){return n<=9?"A":n<=17?"B":n<=25?"C":"D"}
function rosterIndexes(team:any){return (Array.isArray(team?.roster)?team.roster:[]).map((r:any)=>{const value=Number.isInteger(r)?r:(r&&typeof r==="object"?r.golferIndex:null);if(value===null||value===undefined||typeof value==="boolean"||String(value).trim()==="")return null;const index=Number(value);return Number.isSafeInteger(index)&&index>=0?index:null}).filter((x:any)=>x!==null)}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth=req.headers.get("Authorization")||"";
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user)return json({error:"Player sign-in required."},401);
  const body=await req.json().catch(()=>({}));
  const action=String(body?.action||"");
  const draftId=String(body?.draft_id||"elleng-cup");
  const tournamentId=String(body?.tournament_id||"elleng-cup-live");
  async function getDraft(){const {data,error}=await service.from("elleng_drafts").select("owner_id,state").eq("id",draftId).single();if(error||!data)throw new Error("Draft not found.");return data}
  function golferInfoByIndex(draft:any,golferIndex:number){if(!Number.isInteger(golferIndex)||golferIndex<0)throw new Error("Choose a valid golfer.");const state=draft.state||{};const golfers=Array.isArray(state.golfers)?state.golfers:[];const golfer=golfers[golferIndex];const golferName=String(golfer?.name||"").trim();if(!golferName)throw new Error("That golfer is not available.");return {state,golfers,golfer,golferName,golferIndex}}
  async function ownGolfer(draft:any){const {data:link,error}=await service.from("elleng_player_accounts").select("golfer_index").eq("draft_id",draftId).eq("user_id",user.id).maybeSingle();if(error)throw error;if(!link)throw new Error("Your login is not linked to a golfer profile yet. Ask the Commissioner to create your player login.");return golferInfoByIndex(draft,Number(link.golfer_index))}
  async function requireCommissioner(){const draft=await getDraft();if(draft.owner_id!==user.id)throw new Error("Commissioner access required.");return draft}
  function withTeam(base:any){let teamIndex=base.golfer?.team===null||base.golfer?.team===undefined||base.golfer?.team===""?null:Number(base.golfer.team);if(!Number.isInteger(teamIndex)){const teams=Array.isArray(base.state.teams)?base.state.teams:[];teamIndex=teams.findIndex((t:any)=>rosterIndexes(t).includes(base.golferIndex))}if(!Number.isInteger(teamIndex)||Number(teamIndex)<0)throw new Error("You have not been drafted to a team yet.");return {...base,teamIndex:Number(teamIndex)}}
  async function activeTournament(teamIndex:number){const {data,error}=await service.from("elleng_tournaments").select("team_count,status,draft_id").eq("id",tournamentId).single();if(error||!data)throw new Error("Tournament not found.");if(String(data.draft_id||"")!==draftId)throw new Error("Tournament is not linked to this draft.");const count=Number(data.team_count);if(!Number.isInteger(count)||teamIndex<0||teamIndex>=count)throw new Error("Your team is not active in this tournament.");if(!["setup","live"].includes(String(data.status||"")))throw new Error("Scoring is closed for this tournament.");return data}

  if(action==="reset_pin"||action==="issue_activation"){
    const draft=await requireCommissioner();
    const golferIndex=Number(body?.golfer_index);const base=golferInfoByIndex(draft,golferIndex);
    return json({ok:true,deprecated:true,golfer_name:base.golferName,message:"Player PINs are no longer used. Player access now uses individual logins."});
  }

  if(action==="update_handicap"){
    const handicapRaw=body?.handicap==null?"":String(body.handicap).trim();let band=String(body?.band||"").toUpperCase();
    let handicap="";if(handicapRaw!==""){const n=Number(handicapRaw);if(!Number.isFinite(n)||n<0||n>54)return json({error:"Handicap must be between 0 and 54, or leave it blank."},400);handicap=handicapRaw;band=bandFromHandicap(n)}else if(!["A","B","C","D"].includes(band))return json({error:"Choose A, B, C, or D."},400);
    const draft=await getDraft();const base=await ownGolfer(draft);
    const {data:patched,error:patchError}=await service.rpc("elleng_patch_golfer_atomic",{p_draft_id:draftId,p_golfer_index:base.golferIndex,p_patch:{band,hcp:handicap}});if(patchError)throw patchError;
    const savedHcp=patched?.hcp==null?"":String(patched.hcp);const savedBand=String(patched?.band||"").toUpperCase();if(savedHcp!==handicap||savedBand!==band)return json({error:"Handicap did not save correctly. Please try again."},409);
    return json({ok:true,band:savedBand,handicap:savedHcp,golfer_name:base.golferName,verified:true});
  }

  if(action==="update_score"){
    const holeRaw=body?.hole,hole=Number(holeRaw),raw=body?.score==null?"":String(body.score).trim();if(typeof holeRaw==="boolean"||holeRaw===null||holeRaw===undefined||typeof holeRaw==="object"||String(holeRaw).trim()===""||!Number.isInteger(hole)||hole<1||hole>18)return json({error:"Choose a hole from 1 to 18."},400);let score:number|null=null;if(raw!==""){const n=Number(raw);if(!Number.isInteger(n)||n<1||n>20)return json({error:"Enter a score from 1 to 20."},400);score=n}
    const draft=await getDraft();const v=withTeam(await ownGolfer(draft));const golferIndex=v.golferIndex,state=v.state,teamIndex=v.teamIndex,teams=Array.isArray(state.teams)?state.teams:[],roster=rosterIndexes(teams[teamIndex]);if(!roster.includes(golferIndex))return json({error:"Your team roster is not finalized yet."},400);await activeTournament(teamIndex);const format=state?.playFormat==="split_pair"?"split_pair":"standard",now=new Date().toISOString();
    if(format==="split_pair"){
      const pos=roster.indexOf(golferIndex);if(pos<0||pos>3)return json({error:"Your split-pair assignment is not available."},400);const pairIndex=pos<2?0:1;
      if(score===null){const {error}=await service.from("elleng_pair_hole_scores").delete().eq("tournament_id",tournamentId).eq("hole",hole).eq("team_index",teamIndex).eq("pair_index",pairIndex);if(error)throw error}else{const {error}=await service.from("elleng_pair_hole_scores").upsert({tournament_id:tournamentId,hole,team_index:teamIndex,pair_index:pairIndex,score,updated_at:now},{onConflict:"tournament_id,hole,team_index,pair_index"});if(error)throw error}
      const {data:pairs,error:pe}=await service.from("elleng_pair_hole_scores").select("pair_index,score").eq("tournament_id",tournamentId).eq("hole",hole).eq("team_index",teamIndex);if(pe)throw pe;const a=(pairs||[]).find((x:any)=>Number(x.pair_index)===0),b=(pairs||[]).find((x:any)=>Number(x.pair_index)===1);if(a&&b&&roster.length>=4){const {error}=await service.from("elleng_team_scores").upsert({tournament_id:tournamentId,team_index:teamIndex,hole,score:Number(a.score)+Number(b.score),updated_at:now},{onConflict:"tournament_id,team_index,hole"});if(error)throw error}else{const {error}=await service.from("elleng_team_scores").delete().eq("tournament_id",tournamentId).eq("team_index",teamIndex).eq("hole",hole);if(error)throw error}
      return json({ok:true,mode:"split_pair",team_index:teamIndex,pair_index:pairIndex,golfer_name:v.golferName,score});
    }
    // For the 18-hole shamble, retain each golfer's strokes independently.
    // Points are derived from all players on the team; never overwrite low-ball team scores.
    if(score===null){
      const {error}=await service.from("elleng_player_hole_scores").delete().eq("tournament_id",tournamentId).eq("hole",hole).eq("team_index",teamIndex).eq("golfer_index",golferIndex);
      if(error)throw error;
    }else{
      const {error}=await service.from("elleng_player_hole_scores").upsert({tournament_id:tournamentId,hole,team_index:teamIndex,golfer_index:golferIndex,score,updated_at:now},{onConflict:"tournament_id,hole,team_index,golfer_index"});
      if(error)throw error;
    }
    return json({ok:true,mode:"player_shamble",team_index:teamIndex,golfer_name:v.golferName,score});
  }
  return json({error:"Unknown action."},400);
 }catch(e){console.error(e);return json({error:e instanceof Error?e.message:"Unexpected error."},500)}
});