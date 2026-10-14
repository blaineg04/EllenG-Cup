/* EllenG Cup additive two-team points format. Pure functions, no database writes. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports) module.exports=api;
 else root.EllenGTwoTeamPoints=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const FORMAT_ID='two_team_individual_points';
 const POINTS=Object.freeze({hole_in_one:7,eagle:6,birdie:5,par:4,bogey:2,double_or_worse:1});
 function scoreHole(par,strokes,{pickup=false}={}){
  if(![3,4,5].includes(par))return {ok:false,error:'Par must be 3, 4, or 5'};
  if(pickup)return {ok:true,points:1,result:'double_or_worse',strokes:null,pickup:true};
  if(!Number.isInteger(strokes)||strokes<1)return {ok:false,error:'Strokes must be a positive integer'};
  if(strokes===1)return {ok:true,points:7,result:'hole_in_one',strokes,pickup:false};
  const relative=strokes-par;
  if(relative < -2)return {ok:false,error:'Better than eagle requires an explicit points rule'};
  const result=relative===-2?'eagle':relative===-1?'birdie':relative===0?'par':relative===1?'bogey':'double_or_worse';
  return {ok:true,points:POINTS[result],result,strokes,pickup:false};
 }
 function finalizeEventAtRevision(snapshot,expectedRevision){
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||
     !Number.isSafeInteger(snapshot?.revision)||snapshot.revision!==expectedRevision)
   return {ok:false,conflict:true,error:'Invalid or stale tournament revision'};
  if(snapshot.status!=='live')return {ok:false,error:'Only live tournaments can be finalized'};
  const verified=validateEventSnapshot(snapshot);
  if(!verified.ok)return verified;
  const expected=verified.playerCount*18;
  const completed=verified.board.teams.reduce((sum,t)=>sum+t.completed,0);
  if(completed!==expected)
   return {ok:false,error:'Every golfer must finish all 18 holes',completed,expected};
  if(snapshot.revision===Number.MAX_SAFE_INTEGER)
   return {ok:false,error:'Revision limit reached'};
  return {ok:true,snapshot:{...snapshot,status:'final',revision:snapshot.revision+1},board:verified.board};
 }
 function applyEventScoreAtRevision(snapshot,entry,expectedRevision){
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
   return {ok:false,error:'Expected revision must be a nonnegative integer'};
  if(!Number.isSafeInteger(snapshot?.revision)||snapshot.revision<0)
   return {ok:false,error:'Snapshot has no valid revision'};
  if(snapshot.revision!==expectedRevision)
   return {ok:false,conflict:true,error:'Stale score submission; refresh before retrying'};
  const result=applyEventScore(snapshot,entry);
  if(!result.ok)return result;
  if(snapshot.revision===Number.MAX_SAFE_INTEGER)
   return {ok:false,error:'Revision limit reached'};
  return {...result,snapshot:{...result.snapshot,revision:snapshot.revision+1}};
 }
 function applyEventScore(snapshot,entry){
  const check=validateEventSnapshot(snapshot);
  if(!check.ok)return check;
  if(snapshot.status!=='live')return {ok:false,error:'Scores can only be entered during live play'};
  const team=snapshot.teams.find(t=>t.id===entry?.teamId);
  if(!team||!team.playerIds.includes(entry?.playerId))
   return {ok:false,error:'Golfer is not assigned to the selected team'};
  const updated=upsertHoleEntry(snapshot.entries,entry);
  if(!updated.ok)return updated;
  const next={...snapshot,entries:updated.entries};
  const verified=validateEventSnapshot(next);
  if(!verified.ok)return verified;
  return {ok:true,snapshot:next,board:verified.board,replaced:updated.replaced};
 }
 function validateEventSnapshot(snapshot){
  if(!snapshot||snapshot.format!==FORMAT_ID)return {ok:false,error:'Not a two-team points event'};
  if(!Array.isArray(snapshot.teams)||snapshot.teams.length!==2)
   return {ok:false,error:'Exactly two teams required'};
  const [a,b]=snapshot.teams;
  if(!a||!b||typeof a.id!=='string'||typeof b.id!=='string'||a.id===b.id)
   return {ok:false,error:'Two distinct team IDs required'};
  const roster=validateRoster(a.playerIds,b.playerIds,{requireEqual:snapshot.status==='live'});
  if(!roster.ok)return roster;
  if(!Array.isArray(snapshot.entries))return {ok:false,error:'Missing score entries'};
  const membership=new Map([...a.playerIds.map(id=>[id,a.id]),...b.playerIds.map(id=>[id,b.id])]);
  for(const e of snapshot.entries){
   if(!e||membership.get(e.playerId)!==e.teamId)
    return {ok:false,error:'Score does not match event roster'};
  }
  const board=leaderboard(snapshot.entries,[a.id,b.id]);
  if(!board.ok)return board;
  return {ok:true,board,playerCount:roster.playerCount};
 }
 function validateRoster(teamA,teamB,{requireEqual=true}={}){
  if(!Array.isArray(teamA)||!Array.isArray(teamB)||!teamA.length||!teamB.length)
   return {ok:false,error:'Both teams need at least one golfer'};
  const all=[...teamA,...teamB];
  if(all.some(id=>typeof id!=='string'||!id.trim()))
   return {ok:false,error:'Every golfer needs a nonempty ID'};
  if(new Set(all).size!==all.length)
   return {ok:false,error:'A golfer can belong to only one team'};
  if(requireEqual&&teamA.length!==teamB.length)
   return {ok:false,error:'Official play requires equal roster sizes'};
  return {ok:true,teamSize:teamA.length,playerCount:all.length};
 }
 function upsertHoleEntry(entries,entry){
  if(!Array.isArray(entries))return {ok:false,error:'Entries must be an array'};
  if(!entry||typeof entry.playerId!=='string'||!entry.playerId.trim()||
     !Number.isInteger(entry.hole)||entry.hole<1||entry.hole>18||
     typeof entry.teamId!=='string'||!entry.teamId.trim())
   return {ok:false,error:'Invalid player, team, or hole'};
  const existing=entries.filter(e=>e&&e.playerId===entry.playerId&&e.hole===entry.hole);
  if(existing.length>1)return {ok:false,error:'Duplicate existing player-hole records'};
  if(existing.length&&existing[0].teamId!==entry.teamId)
   return {ok:false,error:'Cannot silently transfer a golfer to another team'};
  if(entries.some(e=>e&&e.playerId===entry.playerId&&e.teamId!==entry.teamId))
   return {ok:false,error:'Golfer belongs to a different team'};
  if(entry.strokes!=null||entry.pickup===true){
   const scored=scoreHole(entry.par,entry.strokes,{pickup:entry.pickup===true});
   if(!scored.ok)return scored;
  }else if(![3,4,5].includes(entry.par))return {ok:false,error:'Invalid par'};
  const next=entries.filter(e=>!(e&&e.playerId===entry.playerId&&e.hole===entry.hole));
  next.push({...entry});
  return {ok:true,entries:next,replaced:existing.length===1};
 }
 function leaderboard(entries,teamIds=['A','B']){
  if(!Array.isArray(teamIds)||teamIds.length!==2||teamIds[0]===teamIds[1]||teamIds.some(id=>typeof id!=='string'||!id.trim()))
   return {ok:false,error:'Exactly two distinct team IDs are required'};
  if(!Array.isArray(entries))return {ok:false,error:'Entries must be an array'};
  const players=new Map();
  for(const e of entries){
   if(!e||!teamIds.includes(e.teamId))return {ok:false,error:'Score belongs to an unknown team'};
   if(typeof e.playerId!=='string'||!e.playerId.trim())return {ok:false,error:'Invalid player ID'};
   const previous=players.get(e.playerId);
   if(previous!==undefined&&previous!==e.teamId)return {ok:false,error:'Golfer appears on both teams'};
   players.set(e.playerId,e.teamId);
  }
  const teams=[];
  for(const id of teamIds){
   const total=totalTeamPoints(entries,id);
   if(!total.ok)return total;
   teams.push({teamId:id,...total});
  }
  const [a,b]=teams;
  return {ok:true,teams,leader:a.points===b.points?'tie':a.points>b.points?a.teamId:b.teamId,
   margin:Math.abs(a.points-b.points),complete:a.completed===b.completed};
 }
 function totalTeamPoints(entries,teamId){
  if(!Array.isArray(entries))return {ok:false,error:'Entries must be an array'};
  let points=0,completed=0;
  const seen=new Set();
  for(const e of entries){
   if(!e||typeof e.playerId!=='string'||!e.playerId.trim()||!Number.isInteger(e.hole)||e.hole<1||e.hole>18)
    return {ok:false,error:'Invalid player or hole'};
   if(e.teamId!==teamId)continue;
   const key=e.playerId+'|'+e.hole;
   if(seen.has(key))return {ok:false,error:'Duplicate player hole'};
   seen.add(key);
   if(e.strokes==null&&!e.pickup)continue;
   const scored=scoreHole(e.par,e.strokes,{pickup:e.pickup===true});
   if(!scored.ok)return scored;
   points+=scored.points;completed++;
  }
  return {ok:true,points,completed};
 }
 return Object.freeze({FORMAT_ID,POINTS,scoreHole,totalTeamPoints,leaderboard,upsertHoleEntry,validateRoster,validateEventSnapshot,applyEventScore,applyEventScoreAtRevision,finalizeEventAtRevision});
});
