/* EllenG Cup uneven-roster planning. Pure preview logic, no roster or scoring writes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EllenGUnevenTeams=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function plan(playerCount,teamCount,format='four-person'){
  if(!Number.isInteger(playerCount)||playerCount<1||!Number.isInteger(teamCount)||teamCount<1||teamCount>playerCount)
   return {ok:false,error:'Team count must be between 1 and the number of golfers'};
  if(!['four-person','two-v-two'].includes(format))return {ok:false,error:'Unknown team format'};
  const base=Math.floor(playerCount/teamCount),extra=playerCount%teamCount;
  const sizes=Array.from({length:teamCount},(_,i)=>base+(i<extra?1:0));
  const uneven=extra!==0;
  const warnings=[];
  if(uneven)warnings.push('Team sizes differ; commissioner must approve a format-specific fairness rule before play.');
  if(format==='four-person'&&sizes.some(n=>n!==4))
   warnings.push('Scramble opportunities vary with team size. Do not automatically award extra shots.');
  if(format==='two-v-two'&&sizes.some(n=>n!==2))
   warnings.push('2v2 pairing is incomplete; commissioner must assign a bye, substitute, or alternate arrangement.');
  return {ok:true,playerCount,teamCount,format,sizes,uneven,requiresCommissionerReview:warnings.length>0,warnings};
 }
 return Object.freeze({plan});
});
