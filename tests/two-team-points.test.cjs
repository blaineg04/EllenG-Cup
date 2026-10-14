const test=require('node:test');
const assert=require('node:assert/strict');
const {FORMAT_ID,scoreHole,totalTeamPoints}=require('../two-team-points.js');
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
