/* Pure, side-effect-free fairness policy for two-team EllenG Cup drafts.
 * Does not mutate the live draft or determine the official scoring winner.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.EllenGCaptainFairness=api;})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const weights=Object.freeze({A:5,B:3,C:2,D:1});
 function plan(state){
  if(!Array.isArray(state?.teams)||state.teams.length!==2)throw new Error('Exactly two teams required.');
  const golfers=state.golfers||[];
  const playing=golfers.filter(g=>String(g?.name||'').trim()&&g.participating!==false);
  if(playing.length<2||playing.length>32)throw new Error('Two-team drafts require 2–32 playing golfers.');
  const captains=state.teams.map((team,t)=>{
   const index=team.captainGolferIndex;
   const golfer=golfers[index];
   if(!Number.isInteger(index)||!golfer||golfer.participating===false||!String(golfer.name||'').trim()||golfer.self_ranked!==true||!Object.hasOwn(weights,golfer.band))throw new Error('Both captains must be playing and ranked.');
   return {team:t,index,band:golfer.band,strength:weights[golfer.band]};
  });
  if(captains[0].index===captains[1].index)throw new Error('Captains must be different golfers.');
  const difference=captains[0].strength-captains[1].strength;
  const weaker=difference===0?null:difference<0?0:1;
  // An equal-strength captain matchup has no automatic preferential team.
  // A coin toss or commissioner-approved neutral tiebreak is needed.
  const firstPick=weaker;
  const base=Math.floor(playing.length/2);
  const capacities=[base,base];
  // Give the extra spot to the weaker seed when the count is odd.
  // Official scoring MUST use per-golfer averages for uneven teams.
  if(playing.length%2)capacities[weaker===null?0:weaker]++;
  return {version:1,playing:playing.length,captains,weakerCaptainTeam:weaker,firstOrdinaryPickTeam:firstPick,capacities,requiresTiebreak:weaker===null};
 }
 return Object.freeze({plan});
});
