/* Commissioner preview: assign every golfer to balanced teams, then rearrange without exclusion.
 * Pure functions only; does not alter draft or live tournament data.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EllenGTeamAssignments=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function validate(players,teamCount){
  if(!Array.isArray(players)||players.length<1||!Number.isInteger(teamCount)||teamCount<1||teamCount>players.length)
   return {ok:false,error:'Invalid player roster or team count'};
  const ids=new Set();
  for(const p of players){
   if(!p||typeof p.id!=='string'||!p.id.trim()||ids.has(p.id))
    return {ok:false,error:'Every golfer must have a unique nonempty ID'};
   ids.add(p.id);
  }
  return {ok:true};
 }
 function distribute(players,teamCount){
  const checked=validate(players,teamCount);if(!checked.ok)return checked;
  const teams=Array.from({length:teamCount},(_,i)=>({id:'team-'+(i+1),playerIds:[]}));
  players.forEach((p,i)=>teams[i%teamCount].playerIds.push(p.id));
  return {ok:true,teams,playerCount:players.length,uneven:players.length%teamCount!==0};
 }
 function rearrange(players,teams,playerId,targetTeamId){
  if(!Array.isArray(teams)||!teams.length)return {ok:false,error:'Missing teams'};
  const checked=validate(players,teams.length);if(!checked.ok)return checked;
  const allowed=new Set(players.map(p=>p.id)),seen=new Set(),teamIds=new Set();
  let source=null,target=null;
  for(const t of teams){
   if(!t||typeof t.id!=='string'||!t.id.trim()||teamIds.has(t.id)||!Array.isArray(t.playerIds))
    return {ok:false,error:'Invalid team structure'};
   teamIds.add(t.id);
   if(t.id===targetTeamId)target=t;
   for(const id of t.playerIds){
    if(!allowed.has(id)||seen.has(id))return {ok:false,error:'Unknown or duplicate golfer'};
    seen.add(id);if(id===playerId)source=t;
   }
  }
  if(seen.size!==players.length||!source||!target)return {ok:false,error:'All golfers must be assigned exactly once'};
  const updated=teams.map(t=>({id:t.id,playerIds:[...t.playerIds]}));
  if(source.id!==target.id){
   updated.find(t=>t.id===source.id).playerIds=source.playerIds.filter(id=>id!==playerId);
   updated.find(t=>t.id===target.id).playerIds.push(playerId);
  }
  const sizes=updated.map(t=>t.playerIds.length);
  return {ok:true,teams:updated,uneven:Math.max(...sizes)!==Math.min(...sizes),
   requiresCommissionerReview:Math.max(...sizes)-Math.min(...sizes)>1||sizes.some(n=>n===0)};
 }
 return Object.freeze({distribute,rearrange});
});
