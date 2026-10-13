/* EllenG Cup 2v2 pairing planner — pure logic, no database access.
 * Does not change existing scoring or tournament state.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.EllenGTwoVsTwo=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const FORMATS=Object.freeze({
    scramble:'2-Man Scramble',
    best_ball:'2-Man Best Ball',
    shamble:'2-Man Shamble',
    split_nine:'EllenG Split Nine'
  });

  function planPairings(teamA,teamB,format){
    if(!Object.prototype.hasOwnProperty.call(FORMATS,format))
      return {ok:false,error:'Select a valid 2v2 playing format.'};
    if(!Array.isArray(teamA)||!Array.isArray(teamB))
      return {ok:false,error:'Both team rosters are required.'};
    if(teamA.length!==teamB.length)
      return {ok:false,error:'2v2 requires equal active roster sizes. Assign substitutes or rotations first.'};
    if(teamA.length<2||teamA.length%2!==0)
      return {ok:false,error:'Each team needs an even number of active golfers, at least two.'};
    const all=[...teamA,...teamB];
    if(all.some(p=>!p||typeof p.id!=='string'||!p.id.trim()))
      return {ok:false,error:'Every active golfer needs a nonempty unique ID.'};
    if(new Set(all.map(p=>p.id)).size!==all.length)
      return {ok:false,error:'A golfer cannot appear twice in the pairings.'};
    const matches=[];
    for(let i=0;i<teamA.length;i+=2)
      matches.push({match:i/2+1,teamA:[teamA[i].id,teamA[i+1].id],teamB:[teamB[i].id,teamB[i+1].id],format});
    return {ok:true,format,matches};
  }


  // Adapt the existing draft roster without writing to the tournament database.
  // Captains count as golfers only when they are present in a team roster.
  function fromDraftState(state,format){
    if(!state||!Array.isArray(state.teams)||state.teams.length!==2||!Array.isArray(state.golfers))
      return {ok:false,error:'Choose exactly two drafted teams first.'};
    const make=(team,index)=>{
      if(!Array.isArray(team.roster)) return null;
      return team.roster.map(playerIndex=>{
        const golfer=state.golfers[playerIndex];
        if(!Number.isInteger(playerIndex)||!golfer||!String(golfer.name||'').trim()) return null;
        return {id:String(playerIndex),name:String(golfer.name)};
      });
    };
    const a=make(state.teams[0],0),b=make(state.teams[1],1);
    if(!a||!b||a.some(x=>!x)||b.some(x=>!x))
      return {ok:false,error:'The draft roster contains an invalid golfer.'};
    const result=planPairings(a,b,format);
    if(!result.ok) return result;
    return {...result,teamNames:state.teams.map((t,i)=>String(t.name||'Team '+(i+1))),
      golferNames:Object.fromEntries([...a,...b].map(p=>[p.id,p.name]))};
  }

  return Object.freeze({FORMATS,planPairings,fromDraftState});
});
