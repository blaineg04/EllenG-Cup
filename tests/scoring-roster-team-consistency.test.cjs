const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('scoring.html','utf8');
const start=html.indexOf('function teamRosterGolfers('),end=html.indexOf('function validStoredPlayerScore(',start);
assert(start>=0&&end>start,'scoring roster function missing');
function visible(team,rosters,golfers){
 const ctx={draftState:{teams:rosters.map(roster=>({roster})),golfers}};
 vm.runInNewContext(html.slice(start,end),ctx);
 return Array.from(ctx.teamRosterGolfers(team),g=>g.index);
}
test('draft and scoring agree on active team ownership despite stale roster entries',()=>{
 const golfers=[
  {name:'Active A',team:0,participating:true},
  {name:'Withdrawn',team:0,participating:false},
  {name:'Moved B',team:1,participating:true},
  {name:'Active B',team:1,participating:true},
  {name:'Unassigned',team:null,participating:true}
 ];
 const rosters=[[0,1,2,4],[2,3]];
 assert.deepEqual(visible(0,rosters,golfers),[0,4]);
 assert.deepEqual(visible(1,rosters,golfers),[2,3]);
});
test('scoring ignores duplicate, invalid and unnamed roster entries',()=>{
 const golfers=[{name:'A',team:0},{name:'',team:0},{name:'B',team:0}];
 assert.deepEqual(visible(0,[[0,0,1,-1,99,2]],golfers),[0,2]);
});
