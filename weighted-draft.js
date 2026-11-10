/* Versioned, pure two-team allocation model. No data writes or inferred handicaps. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.EllenGWeightedDraft=api;})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const bands=['A','B','C','D'],weights=[5,3,2,1];
 const active=g=>!!String(g?.name||'').trim()&&g.participating!==false;
 let cacheKey=null,cacheValue=null;
 function options(state){
  if(state.teams?.length!==2)throw new Error('Weighted balance requires two teams.');
  if(state.draftRules==='weighted')for(let t=0;t<2;t++){
   const i=state.teams[t].captainGolferIndex;
   if(!Number.isInteger(i)||state.picks?.[t]?.golfer!==i||state.picks[t].team!==t||state.golfers?.[i]?.team!==t||!state.teams[t].roster?.includes(i))throw new Error('Weighted captain seeds must remain assigned.');
  }
  const golfers=state.golfers||[],playing=golfers.map((g,i)=>({...g,i})).filter(active);
  if(playing.length<2||playing.length>500)throw new Error('Weighted balance requires 2–500 playing golfers.');
  if(playing.some(g=>g.self_ranked!==true||!bands.includes(g.band)))throw new Error('Every playing golfer needs a submitted handicap band.');
  const totals=[0,0,0,0],fixed=[[0,0,0,0],[0,0,0,0]],capacities=[0,0],seen=new Set();
  for(let n=0;n<playing.length;n++){const r=Math.floor(n/2),p=n%2;capacities[state.draftType==='snake'&&r%2?1-p:p]++;}
  for(let t=0;t<2;t++)for(const i of state.teams[t].roster||[]){if(!Number.isInteger(i)||seen.has(i)||!active(golfers[i])||golfers[i].team!==t)throw new Error('Draft roster assignments are inconsistent.');seen.add(i);}
  for(const g of playing){const b=bands.indexOf(g.band);totals[b]++;if(g.team!=null){if(!Number.isInteger(g.team)||g.team<0||g.team>1||!seen.has(g.i))throw new Error('Draft roster assignments are inconsistent.');fixed[g.team][b]++;}}
  if(fixed.some((row,t)=>row.reduce((a,b)=>a+b,0)>capacities[t]))throw new Error('Team roster exceeds its capacity.');
  const key=JSON.stringify([totals,fixed,capacities]);if(key===cacheKey)return structuredClone(cacheValue);
  let best=null,eligible=[new Set(),new Set()];
  const low=fixed[0],high=totals.map((n,b)=>n-fixed[1][b]);
  const totalStrength=totals.reduce((n,c,b)=>n+c*weights[b],0);
  for(let a=low[0];a<=Math.min(high[0],capacities[0]);a++)for(let b=low[1];b<=Math.min(high[1],capacities[0]-a);b++)for(let c=low[2];c<=Math.min(high[2],capacities[0]-a-b);c++){
   const d=capacities[0]-a-b-c;if(d<low[3]||d>high[3])continue;
   const allocation=[a,b,c,d],strength=5*a+3*b+2*c+d;
   const score=[Math.abs(strength*capacities[1]-(totalStrength-strength)*capacities[0]),allocation.reduce((n,count,i)=>n+(count*capacities[1]-(totals[i]-count)*capacities[0])**2,0)];
   if(!best||score[0]<best[0]||score[0]===best[0]&&score[1]<best[1]){best=score;eligible=[new Set(),new Set()];}
   if(score[0]===best[0]&&score[1]===best[1])for(let i=0;i<4;i++){if(allocation[i]>fixed[0][i])eligible[0].add(bands[i]);if(totals[i]-allocation[i]>fixed[1][i])eligible[1].add(bands[i]);}
  }
  if(!best)throw new Error('No valid final roster allocation is possible.');
  // First-round A/B protection: a team cannot take its second golfer in
  // a premium band while the other team has none and can still receive one.
  // This is evaluated on every pick, including weighted drafts with captains.
  for(let t=0;t<2;t++)for(let b=0;b<2;b++){
   const other=1-t,remaining=totals[b]-fixed[0][b]-fixed[1][b];
   const otherOpen=capacities[other]-fixed[other].reduce((a,n)=>a+n,0);
   if(fixed[t][b]>0&&fixed[other][b]===0&&remaining>0&&otherOpen>0)eligible[t].delete(bands[b]);
  }
  // For ordinary-sized tournaments, verify that every offered next pick
  // has at least one complete legal snake-order continuation. The final
  // allocation optimizer alone cannot guarantee this.
  if(playing.length<=32){
   const assigned=fixed[0].reduce((n,v)=>n+v,0)+fixed[1].reduce((n,v)=>n+v,0);
   const remaining=totals.map((v,b)=>v-fixed[0][b]-fixed[1][b]);
   const memo=new Map();
   function reachable(n,left,a,b){
    if(n===playing.length)return left.every(v=>v===0);
    const key=n+'|'+left.join(',')+'|'+a.join(',')+'|'+b.join(',');
    if(memo.has(key))return memo.get(key);
    const round=Math.floor(n/2),p=n%2,t=state.draftType==='snake'&&round%2?1-p:p;
    const own=t===0?a:b,other=t===0?b:a;
    for(let band=0;band<4;band++){
     if(!left[band])continue;
     if(band<2&&own[band]>0&&other[band]===0)continue;
     left[band]--;own[band]++;
     const ok=reachable(n+1,left,a,b);
     own[band]--;left[band]++;
     if(ok){memo.set(key,true);return true;}
    }
    memo.set(key,false);return false;
   }
   const round=Math.floor(assigned/2),p=assigned%2,turn=state.draftType==='snake'&&round%2?1-p:p;
   const feasible=new Set();
   for(let band=0;band<4;band++){
    if(!remaining[band])continue;
    const own=fixed[turn],other=fixed[1-turn];
    if(band<2&&own[band]>0&&other[band]===0)continue;
    remaining[band]--;own[band]++;
    const ok=reachable(assigned+1,remaining,fixed[0],fixed[1]);
    own[band]--;remaining[band]++;
    if(ok)feasible.add(bands[band]);
   }
   // Prefer weighted-optimal picks that are actually reachable; if the
   // unconstrained optimum is impossible, allow a legal continuation.
   const intersection=[...eligible[turn]].filter(b=>feasible.has(b));
   eligible[turn]=new Set(intersection.length?intersection:feasible);
  }
  const result={version:1,capacities,score:best,eligible:eligible.map(s=>[...s].sort()),strength:fixed.map(row=>row.reduce((n,c,b)=>n+c*weights[b],0))};
  cacheKey=key;cacheValue=structuredClone(result);return result;
 }
 function prepare(state){
  if(state.teams?.length!==2)throw new Error('Weighted balance requires two teams.');
  if(!state.timerPaused)throw new Error('Pause the draft before preparing weighted balance.');
  const next=structuredClone(state),indices=[];
  for(let t=0;t<2;t++){
   const name=String(next.teams[t].captain||'').trim().toLowerCase();
   const matches=next.golfers.map((g,i)=>({g,i})).filter(({g})=>active(g)&&String(g.name).trim().toLowerCase()===name);
   if(!name||matches.length!==1||indices.includes(matches[0]?.i))throw new Error('Each captain must match one distinct playing golfer.');
   indices.push(matches[0].i);
  }
  if((next.picks||[]).some((p,n)=>n>1||p.team!==n||p.golfer!==indices[n])||next.golfers.some((g,i)=>g.team!=null&&(indices[g.team]!==i)))throw new Error('Cannot change balancing after ordinary picks. Undo those picks first.');
  next.teams.forEach((t,i)=>{t.roster=[indices[i]];t.captainGolferIndex=indices[i];});
  next.golfers.forEach((g,i)=>{g.team=indices.includes(i)?indices.indexOf(i):null;});
  next.picks=indices.map((golfer,team)=>({golfer,team,captain:true}));
  next.draftRules='weighted';next.balanceVersion=1;next.timerPaused=true;next.timerEndsAt=null;
  options(next);return next;
 }
 return Object.freeze({options,prepare});
});
