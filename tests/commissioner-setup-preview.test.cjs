'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('commissioner preview reflects unsaved golfer, band, and draft-format edits',()=>{
 const html=fs.readFileSync('admin.html','utf8');
 assert.match(html,/id="draftSetupPreview"/);
 const start=html.indexOf('function updateDraftSetupPreview(){');
 const end=html.indexOf('document.getElementById("grows")?.addEventListener(',start);
 assert.ok(start>=0&&end>start);
 const source=html.slice(start,end);
 for(const format of ['snake','straight']){
  const el={textContent:''};
  const names=Array.from({length:27},(_,i)=>({dataset:{n:String(i)},value:'Golfer '+i}));
  const bands=Array.from({length:27},(_,i)=>({dataset:{b:String(i)},value:i===0?'':'C'}));
  const S={teams:Array.from({length:7},()=>({})),golfers:[]};
  const inputs={setupTeamCount:{value:'7'},setupGolferCount:{value:'27'},dtype:{value:format}};
  const ctx={S,bands:['A','B','C','D'],document:{
   getElementById:id=>id==='draftSetupPreview'?el:inputs[id]||null,
   querySelectorAll:selector=>selector.includes('[data-n]')?names:bands
  }};
  vm.runInNewContext(source+'\nupdateDraftSetupPreview();',ctx);
  const counts=Array(7).fill(0);
  for(let i=0;i<27;i++){
   const round=Math.floor(i/7),position=i%7;
   counts[format==='snake'&&round%2?6-position:position]++;
  }
  assert.ok(el.textContent.includes(counts.join(' / ')),format);
  assert.ok(el.textContent.includes('1 golfer(s) need a valid handicap band'));
  names[0].value='';
  vm.runInNewContext('updateDraftSetupPreview();',ctx);
  assert.ok(el.textContent.includes('26 named golfers'));
  assert.ok(el.textContent.includes('All named golfers have handicap bands'));
  assert.equal(S.golfers.length,0,'Preview must not mutate draft state');
  inputs.setupTeamCount.value='9';
  vm.runInNewContext('updateDraftSetupPreview();',ctx);
  assert.match(el.textContent,/unsaved changes/);
  inputs.setupTeamCount.value='invalid';
  vm.runInNewContext('updateDraftSetupPreview();',ctx);
  assert.match(el.textContent,/Enter valid team/);
 }
});
