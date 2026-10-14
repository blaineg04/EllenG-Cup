const test=require('node:test');
const assert=require('node:assert/strict');
const {FORMAT_ID,scoreHole,totalTeamPoints,leaderboard,upsertHoleEntry}=require('../two-team-points.js');
test('new points format has its own identifier',()=>assert.equal(FORMAT_ID,'two_team_individual_points'));
test('points ladder and hole-in-one override',()=>{
 for(const [par,strokes,points] of [[5,3,6],[4,3,5],[4,4,4],[4,5,2],[4,6,1],[4,9,1],[3,1,7]])
  assert.equal(scoreHole(par,strokes).points,points);
 assert.equal(scoreHole(5,1).points,7);
});
test('pickup earns one point without invented strokes',()=>{
 const s=scoreHole(4,null,{pickup:true});
 assert.equal(s.points,1);assert.equal(s.strokes,null);assert.equal(s.pickup,true);
});
test('invalid par and unsupported albatross do not silently earn points',()=>{
 assert.equal(scoreHole(6,4).ok,false);
 assert.equal(scoreHole(5,2).ok,false);
});
test('all golfers count with flexible rosters and unplayed holes earn zero',()=>{
 const entries=Array.from({length:36},(_,i)=>({playerId:'p'+i,teamId:i<18?'A':'B',hole:1,par:4,strokes:i<18?4:5}));
 entries.push({playerId:'p0',teamId:'A',hole:2,par:4,strokes:null});
 assert.deepEqual(totalTeamPoints(entries,'A'),{ok:true,points:72,completed:18});
 assert.deepEqual(totalTeamPoints(entries,'B'),{ok:true,points:36,completed:18});
});
test('duplicate player-hole score is rejected',()=>{
 const entry={playerId:'a',teamId:'A',hole:1,par:4,strokes:4};
 assert.equal(totalTeamPoints([entry,entry],'A').ok,false);
});

test('leaderboard totals every golfer and reports incomplete participation',()=>{
 const entries=[
  {playerId:'a1',teamId:'A',hole:1,par:4,strokes:3},
  {playerId:'a2',teamId:'A',hole:1,par:4,strokes:4},
  {playerId:'b1',teamId:'B',hole:1,par:4,strokes:4},
  {playerId:'b2',teamId:'B',hole:1,par:4,strokes:null}
 ];
 const board=leaderboard(entries);
 assert.equal(board.ok,true);
 assert.equal(board.teams[0].points,9);
 assert.equal(board.teams[1].points,4);
 assert.equal(board.leader,'A');
 assert.equal(board.complete,false);
});
test('leaderboard rejects golfers appearing on both teams',()=>{
 const entries=[
  {playerId:'p',teamId:'A',hole:1,par:4,strokes:4},
  {playerId:'p',teamId:'B',hole:2,par:4,strokes:4}
 ];
 assert.equal(leaderboard(entries).ok,false);
});

test('editing a score replaces its points instead of adding a second hole',()=>{
 const old={playerId:'p1',teamId:'A',hole:1,par:4,strokes:4};
 const next=upsertHoleEntry([old],{...old,strokes:3});
 assert.equal(next.ok,true);
 assert.equal(next.replaced,true);
 assert.equal(next.entries.length,1);
 assert.equal(totalTeamPoints(next.entries,'A').points,5);
 assert.equal(old.strokes,4);
});
test('repeating the same save is idempotent',()=>{
 const entry={playerId:'p1',teamId:'A',hole:1,par:4,strokes:4};
 const first=upsertHoleEntry([],entry);
 const second=upsertHoleEntry(first.entries,entry);
 assert.equal(second.entries.length,1);
 assert.equal(totalTeamPoints(second.entries,'A').points,4);
});
test('score save cannot silently move a golfer between teams',()=>{
 const old={playerId:'p1',teamId:'A',hole:1,par:4,strokes:4};
 assert.equal(upsertHoleEntry([old],{...old,teamId:'B'}).ok,false);
 assert.equal(upsertHoleEntry([old],{...old,hole:2,teamId:'B'}).ok,false);
});
