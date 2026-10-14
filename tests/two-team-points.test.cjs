const test=require('node:test');
const assert=require('node:assert/strict');
const {FORMAT_ID,scoreHole,totalTeamPoints,leaderboard,upsertHoleEntry,validateRoster,validateEventSnapshot,applyEventScore,applyEventScoreAtRevision,finalizeEventAtRevision,startEventAtRevision}=require('../two-team-points.js');
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
 assert.equal(board.balancedProgress,false);
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
 const event={format:FORMAT_ID,status:'live',revision:0,teams:[
  {id:'A',playerIds:['a1','a2']},{id:'B',playerIds:['b1','b2']}
 ],entries:[{playerId:'a1',teamId:'A',hole:1,par:4,strokes:3}]};
 const valid=validateEventSnapshot(event);
 assert.equal(valid.ok,true);
 assert.equal(valid.board.teams[0].points,5);
 assert.equal(validateEventSnapshot({...event,entries:[{...event.entries[0],teamId:'B'}]}).ok,false);
 assert.equal(validateEventSnapshot({...event,format:'standard'}).ok,false);
});
test('event snapshot permits uneven setup but not uneven live rosters',()=>{
 const event={format:FORMAT_ID,status:'setup',revision:0,teams:[
  {id:'A',playerIds:['a1','a2']},{id:'B',playerIds:['b1']}
 ],entries:[]};
 assert.equal(validateEventSnapshot(event).ok,true);
 assert.equal(validateEventSnapshot({...event,status:'live'}).ok,false);
});

test('event score updates produce a new snapshot and fresh leaderboard',()=>{
 const event={format:FORMAT_ID,status:'live',revision:0,teams:[
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
 const event={format:FORMAT_ID,status:'live',revision:0,teams:[
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

test('event snapshot rejects duplicate and malformed records even across teams',()=>{
 const base={format:FORMAT_ID,status:'live',revision:0,teams:[
  {id:'A',playerIds:['a']},{id:'B',playerIds:['b']}
 ],entries:[]};
 const score={playerId:'a',teamId:'A',hole:1,par:4,strokes:4};
 assert.equal(validateEventSnapshot({...base,entries:[score,{...score}]}).ok,false);
 assert.equal(validateEventSnapshot({...base,entries:[{...score,hole:19}]}).ok,false);
 assert.equal(validateEventSnapshot({...base,entries:[{...score,par:6}]}).ok,false);
});

test('players on different teams cannot record conflicting par for the same hole',()=>{
 const base={format:FORMAT_ID,status:'live',revision:0,teams:[
  {id:'A',playerIds:['a']},{id:'B',playerIds:['b']}
 ],entries:[{playerId:'a',teamId:'A',hole:1,par:4,strokes:4}]};
 const inconsistent=applyEventScoreAtRevision(base,{playerId:'b',teamId:'B',hole:1,par:5,strokes:5},0);
 assert.equal(inconsistent.ok,false);
 assert.equal(base.entries.length,1);
 const consistent=applyEventScoreAtRevision(base,{playerId:'b',teamId:'B',hole:1,par:4,strokes:4},0);
 assert.equal(consistent.ok,true);
});

test('starting tournament requires balanced rosters and current revision',()=>{
 const base={format:FORMAT_ID,status:'setup',revision:3,teams:[
  {id:'A',playerIds:['a1','a2']},{id:'B',playerIds:['b1']}
 ],entries:[]};
 assert.equal(startEventAtRevision(base,3).ok,false);
 const ready={...base,teams:[base.teams[0],{id:'B',playerIds:['b1','b2']}]};
 assert.equal(startEventAtRevision(ready,2).conflict,true);
 const started=startEventAtRevision(ready,3);
 assert.equal(started.ok,true);
 assert.equal(started.snapshot.status,'live');
 assert.equal(started.snapshot.revision,4);
 assert.equal(ready.status,'setup');
 assert.equal(startEventAtRevision(started.snapshot,4).ok,false);
});

test('event snapshots reject unknown states and incomplete finalized rounds',()=>{
 const base={format:FORMAT_ID,status:'live',revision:0,teams:[
  {id:'A',playerIds:['a']},{id:'B',playerIds:['b']}
 ],entries:[]};
 assert.equal(validateEventSnapshot({...base,status:'paused'}).ok,false);
 assert.equal(validateEventSnapshot({...base,status:'final'}).ok,false);
 assert.equal(validateEventSnapshot(base).ok,true);
 const entries=['a','b'].flatMap((playerId,i)=>Array.from({length:18},(_,j)=>({
  playerId,teamId:i?'B':'A',hole:j+1,par:4,strokes:4
 })));
 assert.equal(validateEventSnapshot({...base,status:'final',entries}).ok,true);
});

test('local schema prototype is isolated and does not grant public table access',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const sql=fs.readFileSync(path.join(__dirname,'sql','two-team-points-local-schema.sql'),'utf8');
 assert.match(sql,/CREATE SCHEMA IF NOT EXISTS elleng_points_dev/);
 for(const table of ['events','teams','roster','scores'])
  assert.match(sql,new RegExp('CREATE TABLE elleng_points_dev\\.'+table+' \\('));
 assert.match(sql,/PRIMARY KEY\(event_id,player_id,hole\)/);
 assert.match(sql,/REVOKE ALL ON ALL TABLES IN SCHEMA elleng_points_dev FROM PUBLIC/);
 assert.doesNotMatch(sql,/DROP TABLE|ALTER TABLE public\./i);
});

test('local score-save prototype locks event revision and keeps execution private',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const sql=fs.readFileSync(path.join(__dirname,'sql','two-team-points-local-save-score.sql'),'utf8');
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/stale revision/);
 assert.match(sql,/ON CONFLICT\(event_id,player_id,hole\)/);
 assert.match(sql,/revision=revision\+1/);
 assert.match(sql,/REVOKE ALL ON FUNCTION elleng_points_dev\.save_score/);
 const statements=sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n');
 assert.doesNotMatch(statements,/GRANT EXECUTE|CREATE POLICY|ALTER TABLE public\./i);
});

test('local database smoke runner refuses remote databases and requires opt-in',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const sh=fs.readFileSync(path.join(__dirname,'scripts','two-team-points-local-smoke.sh'),'utf8');
 assert.match(sh,/ELLENG_RUN_LOCAL_DB_TESTS/);
 assert.match(sh,/ELLENG_LOCAL_DB_URL/);
 assert.match(sh,/Refusing non-loopback PostgreSQL URL/);
 assert.match(sh,/ON_ERROR_STOP=1/);
 assert.match(sh,/ROLLBACK;/);
 assert.match(sh,/SQLSTATE '40001'/);
});

test('local transaction smoke test covers unauthorized teams and conflicting pars',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const sh=fs.readFileSync(path.join(__dirname,'scripts','two-team-points-local-smoke.sh'),'utf8');
 assert.match(sh,/wrong-team submission accepted/);
 assert.match(sh,/golfer not assigned to team/);
 assert.match(sh,/conflicting par accepted/);
 assert.match(sh,/conflicting hole par/);
 assert.match(sh,/rejected submissions changed revision/);
});

test('local SQL rejects unsupported better-than-eagle results consistently with scoring engine',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const sql=fs.readFileSync(path.join(__dirname,'sql','two-team-points-local-save-score.sql'),'utf8');
 const sh=fs.readFileSync(path.join(__dirname,'scripts','two-team-points-local-smoke.sh'),'utf8');
 assert.match(sql,/p_strokes <> 1 AND p_strokes < p_par - 2/);
 assert.match(sh,/unsupported albatross accepted/);
 assert.equal(scoreHole(5,2).ok,false);
 assert.equal(scoreHole(5,1).result,'hole_in_one');
});

test('local database runner blocks URL connection overrides',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const sh=fs.readFileSync(path.join(__dirname,'scripts','two-team-points-local-smoke.sh'),'utf8');
 assert.match(sh,/unset PGHOST PGHOSTADDR PGSERVICE PGSERVICEFILE PGPORT PGUSER PGDATABASE/);
 assert.match(sh,/PGOPTIONS PGSSLMODE PGREQUIRESSL/);
 assert.match(sh,/Refusing URL userinfo or connection options/);
});

test('local database runner refuses default and unnamed PostgreSQL databases',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const sh=fs.readFileSync(path.join(__dirname,'scripts','two-team-points-local-smoke.sh'),'utf8');
 assert.match(sh,/db_name=.*ELLENG_LOCAL_DB_URL/);
 for(const db of ['postgres','template0','template1'])assert.match(sh,new RegExp('"'+db+'"'));
 assert.match(sh,/Refusing default or unnamed PostgreSQL database/);
});

test('local SQL smoke runner requires a dedicated elleng_points_test database name',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const sh=fs.readFileSync(path.join(__dirname,'scripts','two-team-points-local-smoke.sh'),'utf8');
 assert.match(sh,/elleng_points_test_/);
 assert.match(sh,/Database name must begin with elleng_points_test_/);
});

test('local PostgreSQL install uses one atomic transaction for schema and function',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const sh=fs.readFileSync(path.join(__dirname,'scripts','two-team-points-local-smoke.sh'),'utf8');
 assert.match(sh,/--single-transaction/);
 assert.match(sh,/two-team-points-local-schema\.sql/);
 assert.match(sh,/two-team-points-local-save-score\.sql/);
});

test('final event rejects uneven rosters even if every listed golfer finished',()=>{
 const {FORMAT_ID,validateEventSnapshot}=require('../two-team-points.js');
 const teams=[{id:'A',playerIds:['a1','a2']},{id:'B',playerIds:['b1']}];
 const entries=[];
 for(const t of teams)for(const playerId of t.playerIds)for(let hole=1;hole<=18;hole++)
  entries.push({teamId:t.id,playerId,hole,par:4,strokes:4,pickup:false});
 const result=validateEventSnapshot({format:FORMAT_ID,status:'final',revision:2,teams,entries});
 assert.equal(result.ok,false);
 assert.match(result.error,/equal roster sizes/);
});

test('final snapshots reject unscored placeholder entries',()=>{
 const {FORMAT_ID,validateEventSnapshot}=require('../two-team-points.js');
 const teams=[{id:'A',playerIds:['a']},{id:'B',playerIds:['b']}];
 const entries=[];
 for(const t of teams)for(let hole=1;hole<=18;hole++)
  entries.push({teamId:t.id,playerId:t.playerIds[0],hole,par:4,strokes:4,pickup:false});
 entries[0]={...entries[0],strokes:null,pickup:false};
 const result=validateEventSnapshot({format:FORMAT_ID,status:'final',revision:3,teams,entries});
 assert.equal(result.ok,false);
 assert.match(result.error,/missing golfer-hole scores/);
});

test('balanced progress does not imply that the round is complete',()=>{
 const {leaderboard}=require('../two-team-points.js');
 const board=leaderboard([
  {teamId:'A',playerId:'a',hole:1,par:4,strokes:4},
  {teamId:'B',playerId:'b',hole:1,par:4,strokes:4}
 ]);
 assert.equal(board.ok,true);
 assert.equal(board.balancedProgress,true);
 assert.equal(Object.hasOwn(board,'complete'),false);
});

test('event snapshots reject blank team IDs',()=>{
 const {FORMAT_ID,validateEventSnapshot}=require('../two-team-points.js');
 for(const id of ['', '   ']){
  const result=validateEventSnapshot({format:FORMAT_ID,status:'setup',revision:0,
   teams:[{id,playerIds:['a']},{id:'B',playerIds:['b']}],entries:[]});
  assert.equal(result.ok,false);
  assert.match(result.error,/distinct team IDs/);
 }
});

test('event snapshot revisions must be nonnegative safe integers',()=>{
 const {FORMAT_ID,validateEventSnapshot}=require('../two-team-points.js');
 for(const revision of [undefined,null,-1,0.5,Number.MAX_SAFE_INTEGER+1,'2']){
  const result=validateEventSnapshot({format:FORMAT_ID,status:'setup',revision,
   teams:[{id:'A',playerIds:['a']},{id:'B',playerIds:['b']}],entries:[]});
  assert.equal(result.ok,false);
  assert.match(result.error,/revision/);
 }
});

test('stroke scoring rejects unsafe and noninteger numeric values',()=>{
 for(const strokes of [Number.MAX_SAFE_INTEGER+1,Infinity,NaN,3.5,0,-2])
  assert.equal(scoreHole(4,strokes).ok,false);
 assert.equal(scoreHole(4,4).points,4);
});

test('pickup flag must be a boolean when scoring directly',()=>{
 for(const pickup of ['true',1,null])
  assert.equal(scoreHole(4,4,{pickup}).ok,false);
 assert.equal(scoreHole(4,null,{pickup:true}).points,1);
 assert.equal(scoreHole(4,4,{pickup:false}).points,4);
});

test('local SQL score function explicitly rejects null hole and par',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const sql=fs.readFileSync(path.join(__dirname,'sql','two-team-points-local-save-score.sql'),'utf8');
 assert.match(sql,/p_hole IS NULL OR p_par IS NULL/);
});

test('local schema has no embedded transaction boundary that defeats atomic install',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const sql=fs.readFileSync(path.join(__dirname,'sql','two-team-points-local-schema.sql'),'utf8');
 const statements=sql.split('\n').map(line=>line.trim()).filter(line=>!line.startsWith('--'));
 assert.equal(statements.some(line=>/^(BEGIN|COMMIT|ROLLBACK)\s*;/i.test(line)),false);
});
