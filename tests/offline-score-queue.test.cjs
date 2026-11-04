const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
test('offline recovery module is available',()=>assert.ok(fs.existsSync('offline-score-queue.js'),'identity-scoped recovery is missing'));
function harness(){
 const {createScoreQueue}=require('../offline-score-queue.js');
 const store=new Map();let serial=0;
 const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 return {q:createScoreQueue({storage,id:()=>String(++serial)}),storage,store};
}
const identity={userId:'golfer-a',golferIndex:0,teamIndex:0,draftId:'elleng-cup',tournamentId:'elleng-cup-live',eventDate:'2026-11-20'};
const score=(hole=1,value='4')=>({...identity,hole,score:value,expectedScore:null,expectedUpdatedAt:null});
test('account switch and later tournament cannot replay another golfers pending scores',async()=>{
 const {q}=harness();q.enqueue(score());let sends=0;
 await q.flush({...identity,userId:'golfer-b'},async()=>{sends++});
 await q.flush({...identity,eventDate:'2027-02-20'},async()=>{sends++});
 assert.equal(sends,0);assert.equal(q.entries().length,1);
});
test('latest same-hole edit keeps original baseline and sends once',async()=>{
 const {q}=harness();q.enqueue(score());q.enqueue({...score(1,'5'),expectedScore:4,expectedUpdatedAt:'changed'});
 const sent=[];await q.flush(identity,async item=>{sent.push(item);return {ok:true}});
 assert.equal(sent.length,1);assert.equal(sent[0].score,'5');assert.equal(sent[0].expectedScore,null);assert.equal(q.entries().length,0);
});
test('a queue edit made during replay is preserved',async()=>{
 const {q}=harness();q.enqueue(score());let finish;const pending=new Promise(r=>finish=r);
 const flush=q.flush(identity,async()=>pending);q.enqueue(score(1,'6'));finish({ok:true});await flush;
 assert.equal(q.entries().length,1);assert.equal(q.entries()[0].score,'6');
});
test('overlapping replay is serialized and a conflict remains visible without repeating',async()=>{
 const {q}=harness();q.enqueue(score());let sends=0,finish;
 const a=q.flush(identity,async()=>{sends++;return new Promise(r=>finish=r)});
 const b=q.flush(identity,async()=>{sends++});finish({conflict:true});await Promise.all([a,b]);
 await q.flush(identity,async()=>{sends++});assert.equal(sends,1);assert.equal(q.entries()[0].status,'conflict');
});
test('transport failures remain pending; acknowledged saves remove only older matching edits',async()=>{
 const {q}=harness();const a=q.enqueue(score());await q.flush(identity,async()=>{throw Error('network')});
 assert.equal(q.entries().length,1);q.enqueue(score(2));q.acknowledge({...identity,hole:1},a.id);
 assert.equal(q.entries().length,1);assert.equal(q.entries()[0].hole,2);
});
test('storage failure is never reported as saved offline',()=>{
 const {createScoreQueue}=require('../offline-score-queue.js');const q=createScoreQueue({storage:{getItem:()=>null,setItem:()=>{throw Error('full')}},id:()=> 'a'});
 assert.throws(()=>q.enqueue(score()),/full/);
});
test('legacy queue is retained for review and never assigned to the current login',async()=>{
 const {q,store}=harness();store.set('elleng_offline_score_queue_v1',JSON.stringify([{hole:1,score:'4'}]));
 let sends=0;await q.flush(identity,async()=>{sends++});assert.equal(sends,0);assert.equal(q.legacyCount(),1);
});
test('a successful replay is not removed when server gave no save acknowledgment',async()=>{
 const {q}=harness();q.enqueue(score());await q.flush(identity,async()=>({}));assert.equal(q.entries().length,1);
});
test('invalid scores and unbound identities are refused before storage',()=>{
 const {q}=harness();for(const item of [{...score(),userId:null},{...score(),golferIndex:null},score(0),score(1,'99')])assert.throws(()=>q.enqueue(item));
});
