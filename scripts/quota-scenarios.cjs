/* Reproducible illustrative quota scenarios, not real handicap statistics.
 * Score distributions represent assumed counts of pars, bogeys and doubles.
 * Run with: node scripts/quota-scenarios.cjs
 */
const {summarize}=require('../quota-simulator.js');
const {recommend}=require('../quota-calibration.js');
const pointsFor=(pars,bogeys,doubles)=>pars*2+bogeys;
const profiles={
 A:[[10,6,2],[8,8,2],[7,8,3],[9,6,3],[6,10,2]],
 B:[[7,7,4],[6,8,4],[5,9,4],[8,6,4],[4,10,4]],
 C:[[5,7,6],[4,8,6],[3,9,6],[6,6,6],[2,10,6]],
 D:[[3,5,10],[2,6,10],[1,7,10],[4,4,10],[0,8,10]]
};
const quotas={A:24,B:18,C:12,D:6};
for(const [band,rounds] of Object.entries(profiles)){
 const samples=rounds.map(([pars,bogeys,doubles])=>{
  if(pars+bogeys+doubles!==18)throw Error('Invalid scenario');
  return pointsFor(pars,bogeys,doubles);
 });
 const initial=summarize(samples,quotas[band]);
 const calibrated=recommend(samples,{targetHitRate:0.5,maxQuota:72});
 console.log(JSON.stringify({band,samples,initial,calibrated},null,2));
}
