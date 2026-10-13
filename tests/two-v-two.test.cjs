const test = require('node:test');
const assert = require('node:assert/strict');
const { FORMATS, planPairings } = require('../two-v-two.js');

function players(prefix, count) {
  return Array.from({length:count}, (_,i) => ({id:prefix + (i+1)}));
}

for (const format of Object.keys(FORMATS)) {
  test('2v2 ' + format + ' handles one match', () => {
    const result = planPairings(players('A',2), players('B',2), format);
    assert.equal(result.ok, true);
    assert.equal(result.matches.length, 1);
    assert.deepEqual(result.matches[0].teamA, ['A1','A2']);
    assert.deepEqual(result.matches[0].teamB, ['B1','B2']);
  });
  test('2v2 ' + format + ' handles four matches', () => {
    const result = planPairings(players('A',8), players('B',8), format);
    assert.equal(result.ok, true);
    assert.equal(result.matches.length, 4);
  });
}

test('2v2 rejects unequal rosters', () => {
  assert.equal(planPairings(players('A',4), players('B',2), 'scramble').ok, false);
});
test('2v2 rejects odd rosters', () => {
  assert.equal(planPairings(players('A',3), players('B',3), 'shamble').ok, false);
});
test('2v2 rejects duplicate players', () => {
  assert.equal(planPairings(players('A',2), [{id:'A1'},{id:'B2'}], 'best_ball').ok, false);
});
test('2v2 rejects unsupported formats', () => {
  assert.equal(planPairings(players('A',2), players('B',2), 'other').ok, false);
});

function draftState(teamA,teamB){
  const golfers=[...teamA,...teamB].map(name=>({name}));
  return {golfers,teams:[
    {name:'Gators',roster:teamA.map((_,i)=>i)},
    {name:'Cargo',roster:teamB.map((_,i)=>i+teamA.length)}
  ]};
}
test('draft roster adapter preserves player names and teams',()=>{
  const {fromDraftState}=require('../two-v-two.js');
  const result=fromDraftState(draftState(['Alex','Blake'],['Casey','Drew']),'split_nine');
  assert.equal(result.ok,true);
  assert.deepEqual(result.teamNames,['Gators','Cargo']);
  assert.deepEqual(result.matches[0].teamA,['0','1']);
  assert.equal(result.golferNames['2'],'Casey');
});
test('draft roster adapter rejects more than two teams',()=>{
  const {fromDraftState}=require('../two-v-two.js');
  const state=draftState(['Alex','Blake'],['Casey','Drew']);
  state.teams.push({name:'Extra',roster:[]});
  assert.equal(fromDraftState(state,'scramble').ok,false);
});
test('draft roster adapter rejects missing player references',()=>{
  const {fromDraftState}=require('../two-v-two.js');
  const state=draftState(['Alex','Blake'],['Casey','Drew']);
  state.teams[0].roster[1]=99;
  assert.equal(fromDraftState(state,'best_ball').ok,false);
});
