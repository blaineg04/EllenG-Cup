/* EllenG Cup quota simulator: provisional planning only, no database writes. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.EllenGQuota=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const POINTS=Object.freeze({eagle:8,birdie:4,par:2,bogey:1,double:0,worse:0});
 function pointsForStrokes(strokes,par){
   if(!Number.isInteger(strokes)||strokes<1||!Number.isInteger(par)||par<3||par>5)return null;
   const diff=strokes-par;
   return diff<=-2?8:diff===-1?4:diff===0?2:diff===1?1:0;
 }
 function scoreRound(strokes,pars){
   if(!Array.isArray(strokes)||!Array.isArray(pars)||strokes.length!==18||pars.length!==18)return null;
   const holes=strokes.map((n,i)=>pointsForStrokes(n,pars[i]));
   return holes.some(p=>p===null)?null:holes.reduce((a,b)=>a+b,0);
 }
 function bonus(points,quota){
   if(!Number.isFinite(points)||!Number.isFinite(quota)||points<0||quota<0)return null;
   return Math.max(0,points-quota);
 }
 function summarize(samples,quota){
   if(!Array.isArray(samples)||!samples.length||!samples.every(n=>Number.isFinite(n)&&n>=0)||!Number.isFinite(quota)||quota<0)return null;
   const extras=samples.map(p=>bonus(p,quota));
   return {quota,rounds:samples.length,averagePoints:samples.reduce((a,b)=>a+b,0)/samples.length,
     averageBonus:extras.reduce((a,b)=>a+b,0)/extras.length,
     bonusRate:extras.filter(x=>x>0).length/extras.length};
 }
 return Object.freeze({POINTS,pointsForStrokes,scoreRound,bonus,summarize});
});
