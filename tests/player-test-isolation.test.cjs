const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('player-scoring-test.html','utf8');
test('player acceptance routes only fixed synthetic IDs',()=>{
 const code=html.slice(html.indexOf('const playerTestSplit='),html.indexOf('const playerTestEdgeClient='));
 for(const [query,kind] of [['','standard'],['?format=split','split'],['?format=live&tournament_id=elleng-cup-live','standard']]){
  const ids=vm.runInNewContext(code+'\n({TOURNAMENT_ID,DRAFT_ID})',{URLSearchParams,location:{search:query}});
  assert.equal(ids.TOURNAMENT_ID,'elleng-player-'+kind+'-test-20261029');assert.equal(ids.DRAFT_ID,'elleng-player-'+kind+'-draft-20261029');
 }
 assert(!html.includes('elleng-cup-live'));assert(!html.includes('db.functions.invoke('));
});
test('player acceptance allows real player score path but blocks live routing and account mutations',async()=>{
 const calls=[],DRAFT_ID='elleng-player-standard-draft-20261029',TOURNAMENT_ID='elleng-player-standard-test-20261029';
 const code=html.slice(html.indexOf('const playerTestEdgeClient='),html.indexOf('let tournament=null, scores=[]'));
 const ctx={DRAFT_ID,TOURNAMENT_ID,db:{functions:{invoke:async(name,options)=>{calls.push({name,body:options.body});return {data:{ok:true},error:null}}}}};
 vm.runInNewContext(code,ctx);
 const call=(name,body)=>ctx.invokePlayerTest(name,{body:{draft_id:DRAFT_ID,...body}});
 assert.equal((await call('golfer-handicap',{action:'update_score',tournament_id:TOURNAMENT_ID,hole:1,score:4})).data.ok,true);
 assert((await call('golfer-handicap',{action:'update_score',tournament_id:'elleng-cup-live'})).error);
 assert((await call('golfer-handicap',{action:'update_score',draft_id:'elleng-cup',tournament_id:TOURNAMENT_ID})).error);
 assert((await call('golfer-handicap',{action:'update_handicap'})).error);
 assert((await call('captain-admin',{action:'reset_tournament'})).error);
 assert((await call('player-profile',{action:'update_photo'})).error);
 assert.equal((await call('player-profile',{})).data.ok,true);
 assert.equal((await call('player-admin',{action:'list'})).data.accounts.length,0);
 assert.equal(calls.length,2);
 assert(html.includes('elleng_player_acceptance_queue_${DRAFT_ID}'));
});
