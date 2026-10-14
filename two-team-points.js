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
 return Object.freeze({FORMAT_ID,POINTS,scoreHole,totalTeamPoints,leaderboard});
});
