'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('commissioner setup preview reflects live turn order for uneven teams',()=>{
 const html=fs.readFileSync('admin.html','utf8');
 assert.match(html,/id="draftSetupPreview"/);
 const start=html.indexOf('function updateDraftSetupPreview(){');
 const end=html.indexOf('function setupRender(){',start);
 assert.ok(start>=0&&end>start);
 const source=html.slice(start,end);
 const shared=fs.readFileSync('common.js','utf8');
 const orderStart=shared.indexOf('function order(n){'),orderEnd=shared.indexOf('function bandCounts()',orderStart);
 assert.ok(orderStart>=0&&orderEnd>orderStart);
 for(const format of ['snake','straight']){
  const el={textContent:''};
  const S={teams:Array.from({length:7},()=>({})),golfers:Array.from({length:27},(_,i)=>({name:'Golfer '+i})),draftType:format};
  const ctx={S,cfg:{defaultTeamCount:7},document:{getElementById:id=>id==='draftSetupPreview'?el:null}};
  vm.runInNewContext(shared.slice(orderStart,orderEnd)+source+'\nupdateDraftSetupPreview();',ctx);
  const counts=Array(7).fill(0);
  for(let i=0;i<27;i++)counts[ctx.order(i)]++;
  assert.ok(el.textContent.includes(counts.join(' / ')),format);
  assert.match(el.textContent,/RSVP approval is not yet connected/);
 }
});
