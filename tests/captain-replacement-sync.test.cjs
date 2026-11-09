const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('scoring.html','utf8');
const start=html.indexOf('function syncChangedCaptainPicks(changes){');
const end=html.indexOf('$("saveTeams").addEventListener',start);
assert.ok(start>=0&&end>start,'captain sync function must exist');
const fn=html.slice(start,end);
function run(changes,golfers,picks,teamCount=2){
 const context={draftState:{golfers,picks},activeTeamCount:()=>teamCount};
 vm.runInNewContext(fn+';syncChangedCaptainPicks(changes);',Object.assign(context,{changes}));
 return context.draftState;
}
test('replacement updates initial pick and team, removes former captain',()=>{
 const golfers=[{name:'Carl',team:0},{name:'Aaron',team:1},{name:'Brian',team:null}];
 const picks=[{team:0,golfer:0},{team:1,golfer:1}];
 const state=run([{team:1,oldName:'Aaron',newName:'Brian'}],golfers,picks);
 assert.equal(state.picks[1].golfer,2);
 assert.equal(state.golfers[1].participating,false);
 assert.equal(state.golfers[1].team,null);
 assert.equal(state.golfers[2].team,1);
 assert.equal(state.golfers[2].participating,true);
 assert.equal(state.picks[0].golfer,0);
});
test('rejects replacement after more draft picks without mutating',()=>{
 const golfers=[{name:'Carl',team:0},{name:'Aaron',team:1},{name:'Brian',team:null}];
 const picks=[{team:0,golfer:0},{team:1,golfer:1},{team:0,golfer:2}];
 const before=JSON.stringify({golfers,picks});
 assert.throws(()=>run([{team:1,oldName:'Aaron',newName:'Brian'}],golfers,picks),/additional picks/);
 assert.equal(JSON.stringify({golfers,picks}),before);
});
test('multiple changes validate before any mutation',()=>{
 const golfers=[{name:'Carl',team:0},{name:'Aaron',team:1},{name:'Brian',team:null}];
 const picks=[{team:0,golfer:0},{team:1,golfer:1}];
 const before=JSON.stringify({golfers,picks});
 assert.throws(()=>run([{team:1,oldName:'Aaron',newName:'Brian'},{team:0,oldName:'Carl',newName:'Missing'}],golfers,picks),/exact, unique/);
 assert.equal(JSON.stringify({golfers,picks}),before);
});
test('cannot clear drafted captain',()=>{
 const golfers=[{name:'Carl',team:0}],picks=[{team:0,golfer:0}];
 assert.throws(()=>run([{team:0,oldName:'Carl',newName:''}],golfers,picks),/cannot be cleared/);
});

test('roster rebuild uses replacement golfer after saving',()=>{
 const golfers=[{name:'Carl',team:0},{name:'Aaron',team:1},{name:'Brian',team:null}];
 const picks=[{team:0,golfer:0},{team:1,golfer:1}];
 const state=run([{team:1,oldName:'Aaron',newName:'Brian'}],golfers,picks);
 const rosterStart=html.indexOf('function rebuildTeamRosters(){');
 const rosterEnd=html.indexOf('const TEAM_DEFAULT_COLORS=',rosterStart);
 assert.ok(rosterStart>=0&&rosterEnd>rosterStart,'production roster rebuild must exist');
 const context={draftState:{...state,teams:[{roster:[0]},{roster:[1]}]},ensureDraftShape:()=>{}};
 vm.runInNewContext(html.slice(rosterStart,rosterEnd)+';rebuildTeamRosters();',context);
 assert.deepEqual(JSON.parse(JSON.stringify(context.draftState.teams.map(t=>t.roster))),[[0],[2]]);
 assert.equal(context.draftState.golfers[1].team,null);
});
test('duplicate golfer names cannot change the draft',()=>{
 const golfers=[{name:'Carl',team:0},{name:'Aaron',team:1},{name:'Brian',team:null},{name:'Brian',team:null}];
 const picks=[{team:0,golfer:0},{team:1,golfer:1}];
 const before=JSON.stringify({golfers,picks});
 assert.throws(()=>run([{team:1,oldName:'Aaron',newName:'Brian'}],golfers,picks),/exact, unique/);
 assert.equal(JSON.stringify({golfers,picks}),before);
});

test('stale captain label reconciles actual drafted captain safely',()=>{
 const golfers=[{name:'Carl',team:0},{name:'Aaron Bird',team:1},{name:'Brian Paredes',team:null},{name:'Jarad Jones',team:null,band:'A'}];
 const picks=[{team:0,golfer:0},{team:1,golfer:1}];
 const state=run([{team:1,oldName:'Brian Paredes',newName:'Jarad Jones'}],golfers,picks);
 assert.equal(state.picks[1].golfer,3);
 assert.equal(state.golfers[1].participating,false);
 assert.equal(state.golfers[3].team,1);
 assert.equal(state.golfers[3].band,'A');
});

test('unchanged captain label repairs a stale initial pick',()=>{
 const golfers=[{name:'Carl',team:0},{name:'Brian Paredes',team:1},{name:'Jarad Jones',team:null,band:'A'}];
 const picks=[{team:0,golfer:0},{team:1,golfer:1}];
 const state=run([{team:1,oldName:'Jarad Jones',newName:'Jarad Jones'}],golfers,picks);
 assert.equal(state.picks[1].golfer,2);
 assert.equal(state.golfers[1].participating,false);
 assert.equal(state.golfers[2].team,1);
});
