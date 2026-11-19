'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {renderCommissionerTransfer}=require('../lib/post-draft-commissioner-screen.cjs');
const state={picks:[0,1,2,3],draftRules:'weighted',
 golfers:[{name:'Jarad',team:0},{name:'Carl',team:1},{name:'Alice',team:0},{name:'Bob',team:1}],
 teams:[{name:'Team Jarad',captain:'Jarad',roster:[0,2]},{name:'Team Carl',captain:'Carl',roster:[1,3]}]};
const verified={draftComplete:true,tournamentStatus:'setup',scoresExist:false};
test('renders move and swap selectors without enabling save',()=>{
 const html=renderCommissionerTransfer(state,{operation:'swap',golferIndex:2,otherGolferIndex:3,verified});
 assert.match(html,/Alice → Team Carl/);
 assert.match(html,/Bob → Team Jarad/);
 assert.match(html,/Save changes \(not available\)<\/button>/);
 assert.match(html,/disabled aria-disabled="true"/);
 assert.match(html,/Jarad \(captain\)<\/option>/);
});
test('escapes golfer names and renders no executable markup',()=>{
 const s=structuredClone(state);s.golfers[2].name='<img src=x onerror=alert(1)>';
 const html=renderCommissionerTransfer(s);
 assert.doesNotMatch(html,/<img/);
 assert.match(html,/&lt;img/);
});
test('unverified scoring does not present a valid preview',()=>{
 const html=renderCommissionerTransfer(state,{golferIndex:2,otherGolferIndex:3});
 assert.match(html,/Draft completion not verified/);
});

test('move preview names the destination but never enables saving',()=>{
 const html=renderCommissionerTransfer(state,{operation:'move',golferIndex:2,verified});
 assert.match(html,/Alice → Team Carl/);
 assert.doesNotMatch(html,/id="eg-transfer-second"/);
 assert.match(html,/disabled aria-disabled="true"/);
});
test('a captain selection is explicitly rejected',()=>{
 const html=renderCommissionerTransfer(state,{operation:'move',golferIndex:0,verified});
 assert.match(html,/Captains cannot be transferred/);
 assert.match(html,/disabled aria-disabled="true"/);
});
test('withdrawn golfers cannot be selected as swap targets',()=>{
 const s=structuredClone(state);s.golfers[3].withdrawn=true;
 const html=renderCommissionerTransfer(s,{operation:'swap',golferIndex:2,otherGolferIndex:3,verified});
 assert.doesNotMatch(html,/value="3"/);
 assert.match(html,/Invalid swap golfer/);
});
