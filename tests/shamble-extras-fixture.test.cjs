// Offline-only shamble scoring regression checks. No credentials, network, or tournament writes.
// Run: node tests/shamble-extras-fixture.test.cjs
const assert = require('node:assert/strict');
const {summarize} = require('../shamble-points.js');
const pars = Array(18).fill(4);
const state = {
  teams:[{name:'Fixture A',roster:[0,1]},{name:'Fixture B',roster:[2]}],
  golfers:[
    {name:'Fixture A1',team:0,participating:true},
    {name:'Fixture A2',team:0,participating:true},
    {name:'Fixture B1',team:1,participating:true}
  ]
};
const row=(golfer_index,team_index,hole,score)=>({golfer_index,team_index,hole,score});
let x=summarize(state,[],pars,1);
assert.deepEqual(x.totals.map(t=>t.pts),[0,0]);
assert.equal(x.completeHoles,0);
assert.deepEqual(x.gatorBonus,[0,0]);
x=summarize(state,[row(0,0,1,4),row(2,1,1,3)],pars,1);
assert.deepEqual(x.totals.map(t=>t.pts),[3,4]);
assert.equal(x.completeHoles,0,'partial roster cannot complete a hole');
assert.deepEqual(x.gatorBonus,[0,0],'gator bonus waits for every golfer');
x=summarize(state,[row(0,0,1,4),row(1,0,1,4),row(2,1,1,3)],pars,1);
assert.deepEqual(x.gatorBonus,[0,10],'gator compares per-golfer hole points for uneven rosters');
assert.deepEqual(x.totals.map(t=>t.pts),[6,14]);
assert.equal(x.completeHoles,1);
assert.deepEqual(x.players.map(p=>p.holes),[1,1,1]);
assert.equal(x.totals[1].rankPoints,18,'uneven roster standings use normalized rank points');
const tied=summarize(state,[row(0,0,1,4),row(1,0,1,4),row(2,1,1,4)],pars,1);
assert.deepEqual(tied.gatorBonus,[5,5]);
const withdrawn={...state,golfers:state.golfers.map((g,i)=>i===1?{...g,participating:false}:g)};
const w=summarize(withdrawn,[row(0,0,1,4),row(1,0,1,2),row(2,1,1,4)],pars,null);
assert.equal(w.holes[0][0].expected,1);
assert.equal(w.players[1].holes,0);
assert.equal(w.completeHoles,1);
console.log('Offline shamble fixture checks passed');
