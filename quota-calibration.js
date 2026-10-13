/* Deterministic quota calibration from observed/synthetic point totals.
 * Samples must be supplied by the commissioner or simulation; no implied handicap.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.EllenGQuotaCalibration=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function evaluate(samples,quota){
  if(!Array.isArray(samples)||samples.length===0||samples.some(x=>!Number.isFinite(x)||x<0)||!Number.isInteger(quota)||quota<0)return null;
  const bonuses=samples.map(x=>Math.max(0,x-quota));
  return {quota,rounds:samples.length,hitRate:bonuses.filter(x=>x>0).length/samples.length,
   averageBonus:bonuses.reduce((a,b)=>a+b,0)/samples.length};
 }
 function recommend(samples,{targetHitRate=0.5,maxQuota=72}={}){
  if(!Number.isFinite(targetHitRate)||targetHitRate<0||targetHitRate>1||!Number.isInteger(maxQuota)||maxQuota<0)return null;
  if(!evaluate(samples,0))return null;
  let best=null;
  for(let quota=0;quota<=maxQuota;quota++){
   const metrics=evaluate(samples,quota);
   const distance=Math.abs(metrics.hitRate-targetHitRate);
   if(!best||distance<best.distance||(distance===best.distance&&quota>best.quota))
    best={...metrics,distance};
  }
  return best;
 }
 function compareBands(groups,quotas){
  if(!groups||!quotas||typeof groups!=='object'||typeof quotas!=='object')return null;
  const result={};
  for(const band of ['A','B','C','D']){
   const metrics=evaluate(groups[band],quotas[band]);
   if(!metrics)return null;
   result[band]=metrics;
  }
  return result;
 }
 return Object.freeze({evaluate,recommend,compareBands});
});
