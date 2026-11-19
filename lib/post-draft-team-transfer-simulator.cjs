'use strict';
// In-memory simulation only: NEVER persists or authorizes a production transfer.
const {previewTransfer}=require('./post-draft-team-transfer-preview.cjs');
function memberIndex(entry){return Number.isInteger(entry)?entry:entry&&typeof entry==='object'?entry.golferIndex:null;}
function simulateTransfer(state,request){
 const preview=previewTransfer(state,request);
 if(!preview.ok)return preview;
 const next=JSON.parse(JSON.stringify(state));
 const {sourceTeamIndex:source,destinationTeamIndex:target,golferIndex:a}=preview;
 const sourceRoster=next.teams[source].roster,targetRoster=next.teams[target].roster;
 const sourcePos=sourceRoster.findIndex(x=>memberIndex(x)===a);
 const entryA=sourceRoster[sourcePos];
 if(preview.operation==='swap'){
  const b=preview.otherGolferIndex;
  const targetPos=targetRoster.findIndex(x=>memberIndex(x)===b);
  const entryB=targetRoster[targetPos];
  sourceRoster[sourcePos]=entryB;targetRoster[targetPos]=entryA;
  next.golfers[b].team=source;
 }else{
  sourceRoster.splice(sourcePos,1);targetRoster.push(entryA);
 }
 next.golfers[a].team=target;
 return {ok:true,preview,state:next};
}
module.exports={simulateTransfer};
