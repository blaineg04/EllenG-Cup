/* EllenG Cup: deterministic quota evaluation with transparent fairness diagnostics.
 * Input is a map of bands to actual 18-hole points totals. No DB access.
 * Hit-rate parity alone is not sufficient: compare average bonus as well.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.EllenGQuotaFairness=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const BANDS=['A','B','C','D'];
 function assess(groups,quotas,{minRounds=5}={}){
  if(!Number.isInteger(minRounds)||minRounds<1)return {ok:false,error:'Invalid minimum rounds'};
  const metrics={};
  for(const band of BANDS){
   const samples=groups&&groups[band],quota=quotas&&quotas[band];
   if(!Array.isArray(samples)||samples.length<minRounds||samples.some(n=>!Number.isFinite(n)||n<0)||
      !Number.isInteger(quota)||quota<0)
    return {ok:false,error:'Insufficient or invalid data for band '+band};
   const bonuses=samples.map(n=>Math.max(0,n-quota));
   metrics[band]={rounds:samples.length,quota,
    hitRate:bonuses.filter(n=>n>0).length/samples.length,
    averageBonus:bonuses.reduce((a,b)=>a+b,0)/samples.length};
  }
  const rates=BANDS.map(b=>metrics[b].hitRate),bonuses=BANDS.map(b=>metrics[b].averageBonus);
  return {ok:true,metrics,
   hitRateGap:Math.max(...rates)-Math.min(...rates),
   averageBonusGap:Math.max(...bonuses)-Math.min(...bonuses),
   provisional:BANDS.some(b=>metrics[b].rounds<20)};
 }
 return Object.freeze({assess});
});
