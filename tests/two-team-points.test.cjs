const test=require('node:test');
const assert=require('node:assert/strict');
const {FORMAT_ID,scoreHole,totalTeamPoints,leaderboard,upsertHoleEntry,validateRoster,validateEventSnapshot,applyEventScore,applyEventScoreAtRevision,finalizeEventAtRevision}=require('../two-team-points.js');
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

test('official two-team roster allows large equal teams',()=>{
 const a=Array.from({length:40},(_,i)=>'a'+i);
 const b=Array.from({length:40},(_,i)=>'b'+i);
 assert.deepEqual(validateRoster(a,b),{ok:true,teamSize:40,playerCount:80});
});
test('official play blocks uneven teams but setup can retain uneven RSVPs',()=>{
 assert.equal(validateRoster(['a','b'],['c']).ok,false);
 assert.equal(validateRoster(['a','b'],['c'],{requireEqual:false}).ok,true);
});
test('roster cannot duplicate golfers or omit IDs',()=>{
 assert.equal(validateRoster(['a'],['a']).ok,false);
 assert.equal(validateRoster([''],['b']).ok,false);
});

test('event snapshot verifies team ownership before computing totals',()=>{
 const event={format:FORMAT_ID,status:'live',teams:[
  {id:'A',playerIds:['a1','a2']},{id:'B',playerIds:['b1','b2']}
 ],entries:[{playerId:'a1',teamId:'A',hole:1,par:4,strokes:3}]};
 const valid=validateEventSnapshot(event);
 assert.equal(valid.ok,true);
 assert.equal(valid.board.teams[0].points,5);
 assert.equal(validateEventSnapshot({...event,entries:[{...event.entries[0],teamId:'B'}]}).ok,false);
 assert.equal(validateEventSnapshot({...event,format:'standard'}).ok,false);
});
test('event snapshot permits uneven setup but not uneven live rosters',()=>{
 const event={format:FORMAT_ID,status:'setup',teams:[
  {id:'A',playerIds:['a1','a2']},{id:'B',playerIds:['b1']}
 ],entries:[]};
 assert.equal(validateEventSnapshot(event).ok,true);
 assert.equal(validateEventSnapshot({...event,status:'live'}).ok,false);
});

test('event score updates produce a new snapshot and fresh leaderboard',()=>{
 const event={format:FORMAT_ID,status:'live',teams:[
  {id:'A',playerIds:['a']},{id:'B',playerIds:['b']}
 ],entries:[]};
 const saved=applyEventScore(event,{playerId:'a',teamId:'A',hole:1,par:4,strokes:3});
 assert.equal(saved.ok,true);
 assert.equal(saved.board.teams[0].points,5);
 assert.equal(event.entries.length,0);
 const revised=applyEventScore(saved.snapshot,{playerId:'a',teamId:'A',hole:1,par:4,strokes:4});
 assert.equal(revised.ok,true);
 assert.equal(revised.replaced,true);
 assert.equal(revised.board.teams[0].points,4);
 assert.equal(revised.snapshot.entries.length,1);
});
test('event score update rejects unknown players and non-live tournaments',()=>{
 const event={format:FORMAT_ID,status:'live',teams:[
  {id:'A',playerIds:['a']},{id:'B',playerIds:['b']}
 ],entries:[]};
 const score={playerId:'outsider',teamId:'A',hole:1,par:4,strokes:4};
 assert.equal(applyEventScore(event,score).ok,false);
 assert.equal(applyEventScore({...event,status:'setup'},{...score,playerId:'a'}).ok,false);
});

test('revision-aware score updates reject stale devices without mutating state',()=>{
 const event={format:FORMAT_ID,status:'live',revision:0,teams:[
  {id:'A',playerIds:['a']},{id:'B',playerIds:['b']}
 ],entries:[]};
 const first=applyEventScoreAtRevision(event,{playerId:'a',teamId:'A',hole:1,par:4,strokes:4},0);
 assert.equal(first.ok,true);
 assert.equal(first.snapshot.revision,1);
 const stale=applyEventScoreAtRevision(first.snapshot,{playerId:'b',teamId:'B',hole:1,par:4,strokes:3},0);
 assert.equal(stale.ok,false);
 assert.equal(stale.conflict,true);
 assert.equal(first.snapshot.entries.length,1);
 const retry=applyEventScoreAtRevision(first.snapshot,{playerId:'b',teamId:'B',hole:1,par:4,strokes:3},1);
 assert.equal(retry.ok,true);
 assert.equal(retry.snapshot.revision,2);
});
test('revision-aware updates require a valid snapshot revision',()=>{
 const event={format:FORMAT_ID,status:'live',teams:[
  {id:'A',playerIds:['a']},{id:'B',playerIds:['b']}
 ],entries:[]};
 assert.equal(applyEventScoreAtRevision(event,{playerId:'a',teamId:'A',hole:1,par:4,strokes:4},0).ok,false);
});

test('finalization requires every golfer to complete 18 holes',()=>{
 const base={format:FORMAT_ID,status:'live',revision:0,teams:[
  {id:'A',playerIds:['a']},{id:'B',playerIds:['b']}
 ],entries:[]};
 const incomplete=finalizeEventAtRevision(base,0);
 assert.equal(incomplete.ok,false);
 assert.equal(incomplete.expected,36);
 const entries=['a','b'].flatMap((playerId,i)=>Array.from({length:18},(_,j)=>({
  playerId,teamId:i===0?'A':'B',hole:j+1,par:4,strokes:4
 })));
 const complete=finalizeEventAtRevision({...base,entries},0);
 assert.equal(complete.ok,true);
 assert.equal(complete.snapshot.status,'final');
 assert.equal(complete.snapshot.revision,1);
 assert.equal(finalizeEventAtRevision(complete.snapshot,1).ok,false);
 assert.equal(finalizeEventAtRevision({...base,entries},1).ok,false);
});
