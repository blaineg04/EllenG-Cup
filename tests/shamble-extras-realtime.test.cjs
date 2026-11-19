// Offline subscription contract: verifies a golfer-score event refreshes Extras.
// No Supabase connection or tournament writes.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../scoring.html'),'utf8');
const start=html.indexOf('function subscribeLive(){');
const end=html.indexOf('\nfunction setMobileNavVisible(',start);
assert.ok(start>=0&&end>start,'subscribeLive must exist');
const handlers={};
let loaded=0,rendered=0,catchups=0;
const channel={
 on(type,filter,callback){handlers[filter.table]=callback;return this},
 subscribe(callback){handlers.status=callback;return this}
};
const ctx={
 db:{channel:()=>channel,removeChannel(){}},
 user:{id:'fixture'},TOURNAMENT_ID:'fixture-only',
 document:{hidden:false},
 loadScores:async()=>{loaded++},
 renderAll:()=>{rendered++},
 loadTrashTalk:async()=>{},
 renderTrashTalk:()=>{},
 syncLive:async()=>{catchups++},
 setSyncStatus:()=>{},
 console
};
vm.runInNewContext('let liveChannel=null;\n'+html.slice(start,end)+'\nsubscribeLive();',ctx,{timeout:1000});
assert.equal(typeof handlers.elleng_player_hole_scores,'function');
assert.equal(typeof handlers.status,'function');
(async()=>{
 await handlers.elleng_player_hole_scores({});
 assert.equal(loaded,1,'score change must reload saved scores');
 assert.equal(rendered,1,'score change must redraw Tournament Extras');
 handlers.status('SUBSCRIBED');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(catchups,1,'reconnect must catch up missed scores');
 console.log('Offline realtime scoring refresh checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
