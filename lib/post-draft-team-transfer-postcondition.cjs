'use strict';
// Pure postcondition validator for a future transactional RPC. No database access.
function indexOf(entry){return Number.isInteger(entry)?entry:entry&&typeof entry==='object'?entry.golferIndex:null;}
function validateTransferPostcondition(before,after,request){
 const fail=reason=>({ok:false,reason});
 if(!before||!after||!Array.isArray(before.golfers)||!Array.isArray(after.golfers)||
 !Array.isArray(before.teams)||!Array.isArray(after.teams)||before.teams.length!==2||after.teams.length!==2)
 return fail('Invalid draft shape');
 if(before.golfers.length!==after.golfers.length)return fail('Golfer count changed');
 if(JSON.stringify(before.picks)!==JSON.stringify(after.picks))return fail('Draft picks changed');
 for(const key of Object.keys(before)){
  if(key!=='golfers'&&key!=='teams'&&JSON.stringify(before[key])!==JSON.stringify(after[key]))return fail('Draft metadata changed: '+key);
 }
 if(Object.keys(after).some(key=>!Object.prototype.hasOwnProperty.call(before,key)))return fail('New draft metadata');
 const changed=new Set([request.golferIndex]);
 if(request.operation==='swap')changed.add(request.otherGolferIndex);
 for(let i=0;i<before.golfers.length;i++){
  const a=before.golfers[i],b=after.golfers[i];
  if(!a||!b)return fail('Golfer record missing');
  if(changed.has(i)){
   const {team:oldTeam,...oldRest}=a,{team:newTeam,...newRest}=b;
   if(JSON.stringify(oldRest)!==JSON.stringify(newRest))return fail('Golfer identity or metadata changed');
  }else if(JSON.stringify(a)!==JSON.stringify(b))return fail('Unrelated golfer changed');
 }
 for(let t=0;t<2;t++){
  const {roster:oldRoster,...oldRest}=before.teams[t];
  const {roster:newRoster,...newRest}=after.teams[t];
  if(JSON.stringify(oldRest)!==JSON.stringify(newRest))return fail('Team metadata changed');
  if(!Array.isArray(oldRoster)||!Array.isArray(newRoster))return fail('Invalid roster');
  const oldOther=oldRoster.filter(e=>!changed.has(indexOf(e)));
  const newOther=newRoster.filter(e=>!changed.has(indexOf(e)));
  if(JSON.stringify(oldOther)!==JSON.stringify(newOther))return fail('Unrelated roster entries changed');
 }
 const members=after.teams.flatMap(t=>t.roster.map(indexOf));
 if(members.some(i=>!Number.isInteger(i)||i<0||i>=after.golfers.length)||
 new Set(members).size!==members.length)return fail('Duplicate or invalid roster membership');
 for(let t=0;t<2;t++)for(const entry of after.teams[t].roster){
  if(after.golfers[indexOf(entry)].team!==t)return fail('Golfer team disagrees with roster');
 }
 for(const i of changed)if(!Number.isInteger(i)||!members.includes(i))return fail('Transferred golfer missing');
 if(request.operation==='move'){
  if(after.golfers[request.golferIndex].team!==request.destinationTeamIndex)return fail('Wrong destination');
 }else if(request.operation==='swap'){
  if(after.golfers[request.golferIndex].team!==before.golfers[request.otherGolferIndex].team||
  after.golfers[request.otherGolferIndex].team!==before.golfers[request.golferIndex].team)return fail('Swap not applied');
 }else return fail('Invalid operation');
 return {ok:true};
}
module.exports={validateTransferPostcondition};
