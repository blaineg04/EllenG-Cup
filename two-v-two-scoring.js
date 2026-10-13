/* EllenG Cup 2v2 hole score calculator.
 * Pure functions; no Supabase calls and no tournament-state writes.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports) module.exports=api;
 else root.EllenGTwoVsTwoScoring=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const validScore=n=>Number.isInteger(n)&&n>=1&&n<=30;
 function teamHoleScore(format,hole,entry){
   if(!['scramble','best_ball','shamble','split_nine'].includes(format))
     return {ok:false,error:'Unknown 2v2 format'};
   if(!Number.isInteger(hole)||hole<1||hole>18)
     return {ok:false,error:'Hole must be 1 through 18'};
   const effective=format==='split_nine'?(hole<=9?'scramble':'shamble'):format;
   if(!entry||typeof entry!=='object')
     return {ok:false,error:'Missing hole score'};
   if(effective==='scramble'){
     if(!validScore(entry.teamStrokes))
       return {ok:false,error:'Scramble requires a valid team stroke count'};
     return {ok:true,strokes:entry.teamStrokes,format:effective};
   }
   if(!Array.isArray(entry.playerStrokes)||entry.playerStrokes.length!==2||
      !entry.playerStrokes.every(validScore))
     return {ok:false,error:'Both golfers must enter valid stroke counts'};
   return {ok:true,strokes:Math.min(...entry.playerStrokes),format:effective};
 }
 function compareHole(format,hole,teamA,teamB){
   const a=teamHoleScore(format,hole,teamA);
   if(!a.ok)return {ok:false,team:'A',error:a.error};
   const b=teamHoleScore(format,hole,teamB);
   if(!b.ok)return {ok:false,team:'B',error:b.error};
   return {ok:true,hole,teamA:a.strokes,teamB:b.strokes,
     winner:a.strokes===b.strokes?'tie':a.strokes<b.strokes?'A':'B',
     format:a.format};
 }
 return Object.freeze({teamHoleScore,compareHole});
});
