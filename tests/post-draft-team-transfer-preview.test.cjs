'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {previewTransfer}=require('../lib/post-draft-team-transfer-preview.cjs');
function draft(){return {golfers:[{name:'Jarad'},{name:'Carl'},{name:'A'},{name:'B'}],teams:[{captain:'Jarad',roster:[0,2]},{captain:'Carl',roster:[1,3]}],picks:[{golfer:2,team:0}]};}
const move={operation:'move',golferIndex:2,destinationTeamIndex:1,scoresExist:false};
test('preview valid move without mutating draft',()=>{const s=draft(),before=JSON.stringify(s);assert.equal(previewTransfer(s,move).ok,true);assert.equal(JSON.stringify(s),before)});
test('preview valid swap',()=>assert.equal(previewTransfer(draft(),{operation:'swap',golferIndex:2,otherGolferIndex:3,scoresExist:false}).ok,true));
test('fail closed when score status unknown or scored',()=>{for(const v of [undefined,true]) assert.equal(previewTransfer(draft(),{...move,scoresExist:v}).ok,false)});
test('reject captains',()=>assert.equal(previewTransfer(draft(),{...move,golferIndex:0}).ok,false));
test('reject same team destination',()=>assert.equal(previewTransfer(draft(),{...move,destinationTeamIndex:0}).ok,false));
test('reject invalid swap',()=>assert.equal(previewTransfer(draft(),{operation:'swap',golferIndex:2,otherGolferIndex:0,scoresExist:false}).ok,false));
test('reject duplicate roster',()=>{const s=draft();s.teams[1].roster.push(2);assert.equal(previewTransfer(s,move).ok,false)});
test('reject inactive golfer',()=>{const s=draft();s.golfers[2].participating=false;assert.equal(previewTransfer(s,move).ok,false)});
test('reject absent picks',()=>{const s=draft();s.picks=[];assert.equal(previewTransfer(s,move).ok,false)});
test('reject capacity overflow',()=>assert.equal(previewTransfer(draft(),{...move,destinationCapacity:2}).ok,false));
