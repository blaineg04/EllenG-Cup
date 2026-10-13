const test=require('node:test');
const assert=require('node:assert/strict');
const {distribute,rearrange}=require('../team-assignments.js');
const roster=Array.from({length:19},(_,i)=>({id:'golfer-'+(i+1)}));
test('automatic assignment includes every golfer exactly once',()=>{
 const r=distribute(roster,5);
 assert.equal(r.ok,true);
 assert.deepEqual(r.teams.map(t=>t.playerIds.length),[4,4,4,4,3]);
 assert.equal(new Set(r.teams.flatMap(t=>t.playerIds)).size,19);
 assert.equal(r.uneven,true);
});
test('manual move preserves all golfers and does not mutate original teams',()=>{
 const start=distribute(roster,5);
 const before=structuredClone(start.teams);
 const moved=rearrange(roster,start.teams,'golfer-1','team-5');
 assert.equal(moved.ok,true);
 assert.equal(moved.teams[0].playerIds.includes('golfer-1'),false);
 assert.equal(moved.teams[4].playerIds.includes('golfer-1'),true);
 assert.equal(new Set(moved.teams.flatMap(t=>t.playerIds)).size,19);
 assert.deepEqual(start.teams,before);
});
test('same-team move leaves assignments unchanged',()=>{
 const start=distribute(roster,5);
 const result=rearrange(roster,start.teams,'golfer-1','team-1');
 assert.equal(result.ok,true);
 assert.deepEqual(result.teams,start.teams);
});
test('manual moves flag severe imbalance and empty teams',()=>{
 const players=[{id:'a'},{id:'b'},{id:'c'}];
 const start=distribute(players,2);
 const moved=rearrange(players,start.teams,'c','team-1');
 assert.equal(moved.ok,true);
 assert.equal(moved.requiresCommissionerReview,true);
 assert.deepEqual(moved.teams.map(t=>t.playerIds.length),[3,0]);
});
test('invalid rosters and team counts are rejected',()=>{
 assert.equal(distribute([],1).ok,false);
 assert.equal(distribute([{id:'a'},{id:'a'}],1).ok,false);
 assert.equal(distribute(roster,20).ok,false);
});
test('moves reject absent players and unknown destination teams',()=>{
 const start=distribute(roster,5);
 assert.equal(rearrange(roster,start.teams,'missing','team-1').ok,false);
 assert.equal(rearrange(roster,start.teams,'golfer-1','missing').ok,false);
});
test('moves reject duplicate or omitted golfers in incoming assignments',()=>{
 const start=distribute(roster,5);
 const duplicate=structuredClone(start.teams);
 duplicate[0].playerIds.push('golfer-1');
 assert.equal(rearrange(roster,duplicate,'golfer-1','team-2').ok,false);
 const missing=structuredClone(start.teams);
 missing[0].playerIds.shift();
 assert.equal(rearrange(roster,missing,'golfer-2','team-2').ok,false);
});
