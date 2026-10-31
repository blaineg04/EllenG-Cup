(function(root){
 'use strict';
 const integer=(v,min,max)=>v!==null&&v!==undefined&&typeof v!=='boolean'&&String(v).trim()!==''&&Number.isSafeInteger(Number(v))&&Number(v)>=min&&Number(v)<=max;
 function points(strokes,par){if(!integer(strokes,1,20)||!integer(par,3,5))return null;return Math.max(0,Math.min(5,3+Number(par)-Number(strokes)));}
 function summarize(state,rows,pars){
  const teams=Array.isArray(state?.teams)?state.teams:[],golfers=Array.isArray(state?.golfers)?state.golfers:[];
  const owners=new Map(),rosters=teams.map((team,ti)=>(Array.isArray(team?.roster)?team.roster:[]).map(r=>typeof r==='object'&&r!==null?r.golferIndex:r).filter(i=>integer(i,0,golfers.length-1)).map(Number));
  rosters.forEach((roster,ti)=>roster.forEach(i=>owners.set(i,owners.has(i)?-1:ti)));
  const players=golfers.map((g,i)=>({index:i,team:owners.get(i),points:0,holes:0}));
  const holes=Array.from({length:18},()=>teams.map(()=>({points:0,entered:0,expected:0,complete:false})));
  rosters.forEach((roster,ti)=>{const valid=roster.filter(i=>owners.get(i)===ti&&String(golfers[i]?.name||'').trim()&&(golfers[i].team==null||String(golfers[i].team)===String(ti)));for(const h of holes)h[ti].expected=valid.length;});
  const saved=new Map();
  for(const row of rows||[]){if(!integer(row?.golfer_index,0,golfers.length-1)||!integer(row?.team_index,0,teams.length-1)||!integer(row?.hole,1,18))continue;const gi=Number(row.golfer_index),ti=Number(row.team_index),h=Number(row.hole);if(owners.get(gi)!==ti||!String(golfers[gi]?.name||'').trim()||(golfers[gi].team!=null&&String(golfers[gi].team)!==String(ti)))continue;const value=points(row.score,pars?.[h-1]);if(value===null)continue;saved.set(gi+':'+h,{gi,ti,h,value});}
  for(const {gi,ti,h,value} of saved.values()){players[gi].points+=value;players[gi].holes++;holes[h-1][ti].points+=value;holes[h-1][ti].entered++;}
  const totals=teams.map((_,ti)=>{let pts=0,thru=0;holes.forEach((h,i)=>{const row=h[ti];row.complete=row.expected>0&&row.entered===row.expected;pts+=row.points;if(row.complete)thru=Math.max(thru,i+1);});return {team:ti,pts,thru};});
  const completeHoles=holes.filter(h=>h.length>0&&h.every(x=>x.complete)).length;
  return {players,holes,totals,completeHoles};
 }
 async function fetchScores(client,tournamentId){
  const rows=[];let offset=0;
  for(;;){const {data,error,count}=await client.from('elleng_player_hole_scores').select('*',{count:'exact'}).eq('tournament_id',tournamentId).order('hole').order('team_index').order('golfer_index').range(offset,offset+499);
   if(error)throw error;if(!Array.isArray(data)||!Number.isSafeInteger(count)||count<0)throw Error('Unable to verify individual score completeness');
   rows.push(...data);offset+=data.length;if(offset>=count)return rows;if(!data.length)throw Error('Individual score results were truncated');
  }
 }
 const api={points,summarize,fetchScores};if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.EllenGShamblePoints=api;
})(typeof window!=='undefined'?window:null);
