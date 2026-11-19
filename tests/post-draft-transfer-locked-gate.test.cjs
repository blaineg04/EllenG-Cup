'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {authorizeLockedTransfer}=require('../lib/post-draft-transfer-locked-gate.cjs');
function fixture(){
 const state={draftRules:'weighted',picks:[0,1,2,3],golfers:[{name:'Captain A',team:0},{name:'Captain B',team:1},{name:'Player A',team:0},{name:'Player B',team:1}],teams:[{captain:'Captain A',roster:[0,2]},{captain:'Captain B',roster:[1,3]}]};
 return {actorId:'owner',draft:{id:'draft',owner_id:'owner',updated_at:'revision',status:'setup',state},tournament:{draft_id:'draft',status:'setup'},scoreCounts:{player:0,team:0,pair:0},expectedUpdatedAt:'revision',request:{operation:'swap',golferIndex:2,otherGolferIndex:3}};
}
test('owner can preview a valid swap using trusted locked rows',()=>assert.equal(authorizeLockedTransfer(fixture()).ok,true));
for(const [label,change] of [
 ['unauthenticated',f=>{f.actorId=null}],
 ['non-owner',f=>{f.actorId='other'}],
 ['wrong draft',f=>{f.tournament.draft_id='other'}],
 ['live tournament',f=>{f.tournament.status='live'}],
 ['stale revision',f=>{f.expectedUpdatedAt='old'}],
 ['unfinished draft',f=>{f.draft.state.picks.pop()}],
 ['missing score evidence',f=>{f.scoreCounts=null}],
 ['player score exists',f=>{f.scoreCounts.player=1}],
 ['team score exists',f=>{f.scoreCounts.team=1}],
 ['pair score exists',f=>{f.scoreCounts.pair=1}],
 ['captain swap',f=>{f.request.golferIndex=0}],
 ['same team swap',f=>{f.request.otherGolferIndex=0}],
]){
 test('locked gate rejects '+label,()=>{const f=fixture();change(f);assert.equal(authorizeLockedTransfer(f).ok,false)});
}

test('live-shaped 23-pick draft permits swap with four withdrawn golfers',()=>{
 const f=fixture();
 for(let i=4;i<23;i++) {
   f.draft.state.golfers.push({name:'Golfer '+i,team:i%2});
   f.draft.state.teams[i%2].roster.push(i);
 }
 f.draft.state.picks=Array.from({length:23},(_,i)=>i);
 for(let i=19;i<23;i++) f.draft.state.golfers[i].participating=false;
 assert.equal(f.draft.status,'setup');
 assert.equal(authorizeLockedTransfer(f).ok,true);
 f.draft.state.picks.pop();
 assert.equal(authorizeLockedTransfer(f).reason,'Draft completion not verified');
});
