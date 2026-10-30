const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const file of ['scoring.html']){
 const source=fs.readFileSync(file,'utf8');
 test(file+': saved personal score reloads without overwriting an unsaved edit',()=>{
  const start=source.indexOf('function syncSelfScoreFromSaved(){'),end=source.indexOf('function renderSelfScoreContext(){',start);
  assert(start>=0&&end>start,'Saved-score hydration function must exist');
  const input={value:'',dataset:{}},hole={value:'1'};
  const ctx={TOURNAMENT_ID:'synthetic',user:{id:'player'},currentGolferIndex:0,playerScores:[{team_index:0,golfer_index:0,hole:1,score:4}],pairScores:[],draftState:{teams:[{roster:[0,1,2,3]}]},selfGolferTeamIndex:()=>0,isSplitPair:()=>false,$:id=>id==='selfScoreInput'?input:id==='selfScoreHole'?hole:null};
  vm.runInNewContext(source.slice(start,end),ctx);ctx.syncSelfScoreFromSaved();assert.equal(input.value,'4');
  input.value='5';ctx.playerScores[0].score=6;ctx.syncSelfScoreFromSaved();assert.equal(input.value,'5','Realtime refresh must preserve the typed edit');
  input.value='6';ctx.playerScores[0].score=7;ctx.syncSelfScoreFromSaved();assert.equal(input.value,'7','Clean field follows persisted score');
  input.value='';ctx.syncSelfScoreFromSaved();assert.equal(input.value,'','Unsaved clear must be preserved');
  hole.value='2';ctx.syncSelfScoreFromSaved();assert.equal(input.value,'');
  hole.value='1';ctx.syncSelfScoreFromSaved();assert.equal(input.value,'7');
 });
 test(file+': Split-Pair hydrates only the signed-in player pair',()=>{
  const start=source.indexOf('function syncSelfScoreFromSaved(){'),end=source.indexOf('function renderSelfScoreContext(){',start);assert(start>=0&&end>start);
  const input={value:'',dataset:{}},ctx={TOURNAMENT_ID:'synthetic',user:{id:'player'},currentGolferIndex:2,playerScores:[],pairScores:[{team_index:0,hole:1,pair_index:0,score:18},{team_index:0,hole:1,pair_index:1,score:19}],draftState:{teams:[{roster:[0,1,2,3]}]},selfGolferTeamIndex:()=>0,isSplitPair:()=>true,$:id=>id==='selfScoreInput'?input:id==='selfScoreHole'?{value:'1'}:null};
  vm.runInNewContext(source.slice(start,end),ctx);ctx.syncSelfScoreFromSaved();assert.equal(input.value,'19');
 });
 test(file+': save status is visible and announced',()=>{
  assert(!/#selfScoreMsg\s*\{display:none!important\}/.test(source));
  assert(source.includes('id="selfScoreMsg" role="status" aria-live="polite"'));
 });
}
