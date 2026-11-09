const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('scoring.html','utf8');
const start=html.indexOf('async function savePlayerShambleScore('),end=html.indexOf('function renderPairScoring(',start);
assert(start>=0&&end>start,'Missing scoring handler');
function fixture({rpcError=null,loadedScore=4,loadError=null,scoreValue='4'}={}){
 const msg={textContent:''},status=[],health=[],rpcCalls=[];
 const ctx={hole:3,scoreSaveBusy:false,playerScores:[],TOURNAMENT_ID:'disposable-test',
 isSplitPair:()=>false,isShamblePoints:()=>true,canEditTeam:()=>true,
 teamRosterGolfers:()=>[{index:2}],$:()=>msg,
 db:{rpc:async(name,args)=>{rpcCalls.push(args);assert.equal(name,'elleng_test_authorized_shamble');assert.equal(args.p_golfer_index,2);return {error:rpcError}}},
 loadScores:async()=>{if(loadError)throw loadError;ctx.playerScores=loadedScore===null?[]:[{team_index:0,hole:3,golfer_index:2,score:loadedScore}];},
 renderAll:()=>{ctx.renderCount++},renderCount:0,
 setSyncStatus:(state)=>status.push(state),globalThis:{EllenGHealth:{report:(code)=>health.push(code)}},
 console};
 vm.runInNewContext(html.slice(html.indexOf('function beginScoreSave(',start-600),end),ctx);
 return {run:()=>ctx.savePlayerShambleScore(0,2,scoreValue),ctx,msg,status,health,rpcCalls};
}
test('confirmed saved score shows success after readback',async()=>{
 const f=fixture();await f.run();assert.match(f.msg.textContent,/Individual score saved/);assert.equal(f.status.at(-1),'saved');assert.equal(f.ctx.renderCount,1);
});
test('RPC error never claims saved',async()=>{
 const f=fixture({rpcError:{message:'Network unavailable'}});await f.run();assert.match(f.msg.textContent,/Network unavailable/);assert.equal(f.status.at(-1),'error');assert.equal(f.ctx.renderCount,0);
});
test('readback mismatch never claims saved',async()=>{
 const f=fixture({loadedScore:5});await f.run();assert.match(f.msg.textContent,/could not be confirmed/);assert.equal(f.status.at(-1),'error');assert.equal(f.ctx.renderCount,0);
});
test('missing readback never claims saved',async()=>{
 const f=fixture({loadedScore:null});await f.run();assert.match(f.msg.textContent,/could not be confirmed/);assert.equal(f.status.at(-1),'error');
});
test('refresh error never claims saved',async()=>{
 const f=fixture({loadError:new Error('Refresh failed')});await f.run();assert.match(f.msg.textContent,/Refresh failed/);assert.equal(f.status.at(-1),'error');
});
test('corrected score confirms only new value',async()=>{
 const f=fixture({loadedScore:3,scoreValue:'3'});await f.run();assert.match(f.msg.textContent,/Individual score saved/);assert.equal(f.status.at(-1),'saved');
});

test('invalid and fractional strokes never reach score-write RPC',async()=>{
 for(const scoreValue of ['0','21','4.5','not-a-score']){
  const f=fixture({scoreValue});await f.run();
  assert.equal(f.rpcCalls.length,0,scoreValue);
  assert.equal(f.status.at(-1),'error');
  assert.equal(f.ctx.renderCount,0);
 }
});
test('clear-score request confirms empty readback',async()=>{
 const f=fixture({scoreValue:'',loadedScore:null});await f.run();
 assert.equal(f.rpcCalls.length,1);
 assert.equal(f.rpcCalls[0].p_score,null);
 assert.equal(f.status.at(-1),'saved');
});
test('clear-score request does not report success when old score remains',async()=>{
 const f=fixture({scoreValue:'',loadedScore:4});await f.run();
 assert.equal(f.rpcCalls.length,1);
 assert.equal(f.status.at(-1),'error');
 assert.match(f.msg.textContent,/could not be confirmed/);
});
