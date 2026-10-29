'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {resizeDraftSetup,assertDraftSetupEditable}=require('../draft-setup-config.js');
function initial(){
 return {
  golfers:[{name:'Alice',hcp:'8',band:'A',team:null},{name:'Bob',hcp:'16',band:'B',team:null},
    ...Array.from({length:6},()=>({name:'',hcp:'',band:'',team:null}))],
  teams:[{name:'Team 1',captain:'',roster:[]},{name:'Team 2',captain:'',roster:[]},
    {name:'Team 3',captain:'',roster:[]}],
  picks:[],draftType:'snake',timerLength:60,tournamentName:'EllenG Cup'
 };
}
test('commissioner can prepare two teams and 29 golfer slots without losing existing data',()=>{
 const original=initial(),updated=resizeDraftSetup(original,2,29);
 assert.equal(updated.teams.length,2);
 assert.equal(updated.golfers.length,29);
 assert.deepEqual(updated.golfers.slice(0,2),original.golfers.slice(0,2));
 assert.deepEqual(updated.golfers[28],{name:'',hcp:'',band:'',team:null});
 assert.equal(updated.draftType,'snake');
 assert.equal(updated.timerLength,60);
 assert.equal(original.golfers.length,8,'original state remains unchanged');
 assert.equal(original.teams.length,3);
 updated.golfers[0].name='Changed';
 assert.equal(original.golfers[0].name,'Alice','retained entries are copied');
});
test('nine teams of four can be configured for 36 golfers',()=>{
 const updated=resizeDraftSetup(initial(),9,36);
 assert.equal(updated.teams.length,9);
 assert.equal(updated.golfers.length,36);
 assert.equal(updated.teams[8].name,'Team 9');
 assert.deepEqual(updated.teams[8].roster,[]);
});
test('shrinking cannot discard named golfer, handicap, or rank data',()=>{
 for(const key of ['name','hcp','band']){
  const s=initial();s.golfers[7][key]=key==='name'?'Zoe':key==='hcp'?'18':'D';
  assert.throws(()=>resizeDraftSetup(s,2,7),/Cannot remove a golfer slot/);
 }
});
test('shrinking cannot discard renamed teams or captain assignments',()=>{
 for(const field of ['name','captain']){
  const s=initial();s.teams[2][field]=field==='name'?'Gators':'Captain';
  assert.throws(()=>resizeDraftSetup(s,2,8),/Cannot remove a named team/);
 }
});
test('drafts with picks, team rosters, or assigned golfers cannot be resized',()=>{
 const pick=initial();pick.picks.push({golfer:0,team:0});
 const roster=initial();roster.teams[0].roster.push(0);
 const assigned=initial();assigned.golfers[0].team=0;
 for(const s of [pick,roster,assigned])
  assert.throws(()=>resizeDraftSetup(s,2,8),/Cannot resize after draft picks/);
});
test('invalid counts and malformed state fail closed',()=>{
 const s=initial();
 for(const n of [0,1,37,2.5,NaN,'2'])
  assert.throws(()=>resizeDraftSetup(s,n,8),RangeError);
 for(const n of [0,1,2,501,3.1,'29'])
  assert.throws(()=>resizeDraftSetup(s,3,n),RangeError);
 assert.throws(()=>resizeDraftSetup({},2,8),TypeError);
});
test('commissioner screen wires sizing through verified session and secure save',()=>{
 const html=fs.readFileSync('admin.html','utf8');
 assert.match(html,/<script src="draft-setup-config\.js"><\/script>/);
 assert.match(html,/id="setupTeamCount"/);
 assert.match(html,/id="setupGolferCount"/);
 assert.match(html,/id="applySetupSize"/);
 assert.match(html,/EllenGDraftSetup\.resizeDraftSetup\(S,teamCount,golferCount\)/);
 assert.match(html,/if\(!sameCommissionerAction\(actionEpoch,actionUserId\)\)return;/);
 assert.match(html,/await save\(\);/);
});

test('setup edit guard blocks every assignment signal, not just resizing',()=>{
 const picked=initial();picked.picks.push({golfer:0,team:0});
 const roster=initial();roster.teams[0].roster.push(0);
 const assigned=initial();assigned.golfers[0].team=0;
 for(const state of [picked,roster,assigned])
  assert.throws(()=>assertDraftSetupEditable(state),/Cannot resize after draft picks/);
 assert.equal(assertDraftSetupEditable(initial()),true);
 assert.throws(()=>assertDraftSetupEditable({picks:[]}),TypeError);
});
test('real commissioner field reader cannot mutate an active draft even if called directly',()=>{
 const html=fs.readFileSync('admin.html','utf8');
 const start=html.indexOf('function readSetupFields(){');
 const end=html.indexOf('document.getElementById("applySetupSize").onclick',start);
 assert.ok(start>0&&end>start);
 const state=initial();
 const ctx={S:state,EllenGDraftSetup:require('../draft-setup-config.js'),document:{
  querySelectorAll:selector=>selector==='[data-n]'?[{dataset:{n:'0'},value:'Changed during draft'}]:[],
  getElementById:id=>({dtype:{value:'straight'},tlen:{value:'45'}}[id])
 }};
 vm.createContext(ctx);
 vm.runInContext(html.slice(start,end)+'\nthis.readFields=readSetupFields;',ctx);
 state.picks.push({golfer:0,team:0});
 assert.throws(()=>ctx.readFields(),/Cannot resize after draft picks/);
 assert.equal(state.golfers[0].name,'Alice','field reader must not mutate before checking');
 assert.equal(state.draftType,'snake','draft order must remain unchanged');
 state.picks.length=0;
 ctx.readFields();
 assert.equal(state.golfers[0].name,'Changed during draft','pre-draft edits remain allowed');
 assert.equal(state.draftType,'straight');
});
test('commissioner setup shows read-only fields while picks exist',()=>{
 const html=fs.readFileSync('admin.html','utf8');
 assert.match(html,/EllenGDraftSetup\.assertDraftSetupEditable\(S\)/);
 assert.match(html,/querySelectorAll\("input,select,button"\)\.forEach\(el=>el\.disabled=locked\)/);
 assert.match(html,/Setup is read-only; undo all picks/);
});
