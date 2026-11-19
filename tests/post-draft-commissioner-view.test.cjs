'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildCommissionerTransferView,previewCommissionerChange}=require('../lib/post-draft-commissioner-view.cjs');
const state={
 picks:[0,1,2,3],
 golfers:[{name:'Jarad',team:0},{name:'Carl',team:1},{name:'Alice',team:0},{name:'Bob',team:1}],
 teams:[{name:'Team Jarad',captain:'Jarad',roster:[0,2]},{name:'Team Carl',captain:'Carl',roster:[1,3]}]
};
const verified={draftComplete:true,tournamentStatus:'setup',scoresExist:false};
test('commissioner roster options exclude captains from selection',()=>{
 const view=buildCommissionerTransferView(state);
 assert.equal(view.teams[0].golfers[0].selectable,false);
 assert.equal(view.teams[1].golfers[0].selectable,false);
 assert.equal(view.teams[0].golfers[1].selectable,true);
 assert.equal(view.canSubmit,false);
});
test('preview swap shows both golfers but never enables save',()=>{
 const result=previewCommissionerChange(state,'swap',2,3,verified);
 assert.equal(result.ok,true);
 assert.equal(result.golfer,'Alice');
 assert.equal(result.otherGolfer,'Bob');
 assert.equal(result.canSubmit,false);
});
test('preview blocks captain swaps and unverifiable scoring',()=>{
 assert.equal(previewCommissionerChange(state,'swap',0,3,verified).ok,false);
 assert.equal(previewCommissionerChange(state,'move',2,null,{}).ok,false);
});

test('commissioner selector excludes unused reserved slots and invalid roster entries',()=>{
 const extended=structuredClone(state);
 extended.golfers.push({name:'',team:0},{name:'Unused',team:0,participating:false});
 extended.teams[0].roster.push(4,5,999);
 const view=buildCommissionerTransferView(extended);
 assert.deepEqual(view.teams[0].golfers.map(g=>g.name),['Jarad','Alice']);
});
