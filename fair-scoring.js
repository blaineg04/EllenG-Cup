/* Pure two-team leaderboard ranking. Raw points remain visible and every golfer counts.
 * The Gator bonus is awarded from per-golfer hole averages before ranking.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.EllenGFairScoring=api;})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 function rank(teams){
  if(!Array.isArray(teams)||teams.length!==2)throw new Error('Two teams required.');
  const counts=teams.map(t=>t.golfers);
  if(counts.some(n=>!Number.isInteger(n)||n<1))throw new Error('Each team needs at least one golfer.');
  const uneven=counts[0]!==counts[1];
  return teams.map((t,i)=>{
   if(!Number.isFinite(t.points)||t.points<0)throw new Error('Team points must be nonnegative.');
   const average=t.points/counts[i];
   return {...t,team:i,average,rankPoints:uneven?average:t.points,uneven};
  }).sort((a,b)=>b.rankPoints-a.rankPoints||a.team-b.team);
 }
 function gatorBonus(teams){
  if(!Array.isArray(teams)||teams.length!==2)throw new Error('Two teams required.');
  if(teams.some(t=>!Number.isInteger(t.golfers)||t.golfers<1||!Number.isFinite(t.holePoints)||t.holePoints<0||t.complete!==true))return [0,0];
  const avgs=teams.map(t=>t.holePoints/t.golfers);
  if(Math.abs(avgs[0]-avgs[1])<1e-9)return [5,5];
  return avgs[0]>avgs[1]?[10,0]:[0,10];
 }
 return Object.freeze({rank,gatorBonus});
});
