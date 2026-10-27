'use strict';
// Staged RPC adapter: not wired into production. Server authorization and deployment
// must pass release gates before the app may call it.
async function submitAtomicShambleScore({db,tournamentId,teamIndex,hole,golferIndex,score,roster}){
 if(!db||typeof db.rpc!=='function')throw new Error('Atomic score service unavailable');
 if(typeof tournamentId!=='string'||!tournamentId.trim()||
    !Number.isInteger(teamIndex)||teamIndex<0||
    !Number.isInteger(hole)||hole<10||hole>18||
    !Number.isInteger(golferIndex)||golferIndex<0||
    !Array.isArray(roster)||roster.length===0||roster.some(x=>!Number.isInteger(x)||x<0)||
    new Set(roster).size!==roster.length||!roster.includes(golferIndex)||
    !(score===null||(Number.isInteger(score)&&score>=1&&score<=20)))
    throw new Error('Invalid Shamble score request');
 // Prototype name intentionally separate from any existing production routine.
 const {data,error}=await db.rpc('elleng_test_save_shamble_score',{
  p_tournament_id:tournamentId,p_team_index:teamIndex,p_hole:hole,
  p_golfer_index:golferIndex,p_score:score,p_roster:roster
 });
 if(error)throw new Error(error.message||'Atomic score write rejected');
 return data;
}
module.exports={submitAtomicShambleScore};
