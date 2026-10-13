/* EllenG Cup quota approval guard: pure, commissioner-side planning logic.
 * No database access; approval does not persist or start a tournament.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.EllenGQuotaApproval=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const BANDS=['A','B','C','D'];
 function review(players,bandQuotas,overrides={}){
  if(!Array.isArray(players)||!players.length||!bandQuotas||typeof bandQuotas!=='object'||
     !overrides||typeof overrides!=='object')return {ok:false,error:'Missing player roster or quota settings'};
  for(const band of BANDS)if(!Number.isInteger(bandQuotas[band])||bandQuotas[band]<0)
   return {ok:false,error:'Invalid quota for '+band};
  const ids=new Set(),assigned=[];
  for(const player of players){
   if(!player||typeof player.id!=='string'||!player.id.trim()||ids.has(player.id))
    return {ok:false,error:'Players must have unique nonempty IDs'};
   ids.add(player.id);
   if(!BANDS.includes(player.band))return {ok:false,error:'Unknown band for '+player.id};
   const hasOverride=Object.prototype.hasOwnProperty.call(overrides,player.id);
   const quota=hasOverride?overrides[player.id]:bandQuotas[player.band];
   if(!Number.isInteger(quota)||quota<0||quota>200)
    return {ok:false,error:'Invalid individual quota for '+player.id};
   assigned.push({id:player.id,band:player.band,quota,source:hasOverride?'override':'band'});
  }
  for(const id of Object.keys(overrides))if(!ids.has(id))
   return {ok:false,error:'Override references a player not in the roster'};
  return {ok:true,players:assigned,overrides:assigned.filter(p=>p.source==='override').length};
 }
 function snapshot(players,bandQuotas,overrides){
  const result=review(players,bandQuotas,overrides);
  if(!result.ok)return result;
  return {ok:true,approvedAt:null,status:'draft',players:result.players.map(p=>({...p}))};
 }
 return Object.freeze({review,snapshot});
});
