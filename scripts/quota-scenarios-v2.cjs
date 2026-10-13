/* Deterministic, transparent scenario calibration for EllenG Cup.
 * These profiles are assumptions, NOT validated handicap data.
 * Run: node scripts/quota-scenarios-v2.cjs
 */
const {recommend,evaluate}=require('../quota-calibration.js');
const {pointsForStrokes}=require('../quota-simulator.js');
const par=4;
const distributions={
 A:[{par:10,bogey:6,double:2},{par:8,bogey:8,double:2},{par:7,bogey:8,double:3},{par:9,bogey:6,double:3},{par:6,bogey:10,double:2}],
 B:[{par:7,bogey:7,double:4},{par:6,bogey:8,double:4},{par:5,bogey:9,double:4},{par:8,bogey:6,double:4},{par:4,bogey:10,double:4}],
 C:[{par:5,bogey:7,double:4,triple:2},{par:4,bogey:8,double:3,triple:3},{par:3,bogey:9,double:3,triple:3},{par:6,bogey:6,double:4,triple:2},{par:2,bogey:10,double:3,triple:3}],
 D:[{par:3,bogey:5,double:4,triple:6},{par:2,bogey:6,double:4,triple:6},{par:1,bogey:7,double:4,triple:6},{par:4,bogey:4,double:4,triple:6},{par:0,bogey:8,double:4,triple:6}]
};
const strokeOffsets={eagle:-2,birdie:-1,par:0,bogey:1,double:2,triple:3};
function totalPoints(round){
 const holes=Object.entries(strokeOffsets).flatMap(([label,offset])=>
  Array(round[label]||0).fill(par+offset));
 if(holes.length!==18)throw new Error('Scenario must contain 18 holes');
 return holes.reduce((sum,strokes)=>sum+pointsForStrokes(strokes,par),0);
}
const initial={A:24,B:18,C:12,D:6};
const rows=Object.entries(distributions).map(([band,rounds])=>{
 const samples=rounds.map(totalPoints);
 const current=evaluate(samples,initial[band]);
 const proposed=recommend(samples,{targetHitRate:0.5,maxQuota:72});
 return {band,samples,initialQuota:initial[band],initialHitRate:current.hitRate,
  initialAverageBonus:current.averageBonus,suggestedQuota:proposed.quota,
  suggestedHitRate:proposed.hitRate,suggestedAverageBonus:proposed.averageBonus};
});
console.table(rows);
console.log('CAUTION: only five invented rounds per band; use real rounds to set official quotas.');
module.exports={totalPoints,distributions,rows};
