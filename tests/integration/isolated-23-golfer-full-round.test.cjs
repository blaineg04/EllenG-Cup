const test=require('node:test');
const assert=require('node:assert/strict');
const {points,summarize,fetchScores}=require('../../shamble-points.js');
const pars=Array.from({length:18},(_,h)=>[3,4,5][h%3]);
const golfers=Array.from({length:23},(_,i)=>({name:'Isolated Golfer '+String(i+1).padStart(2,'0'),team:i<12?0:1}));
const teams=[{name:'Isolated Team A',roster:Array.from({length:12},(_,i)=>i)},{name:'Isolated Team B',roster:Array.from({length:11},(_,i)=>i+12)}];
const state={golfers,teams};
const expectedPoints=(strokes,par)=>Math.max(0,Math.min(5,3+par-strokes));
const key=(g,h)=>g+':'+h;
class IsolatedScoreStore {
 constructor(){this.records=new Map()}
 async save(g,h,strokes){if(!Number.isInteger(g)||g<0||g>=23||!Number.isInteger(h)||h<1||h>18||!Number.isInteger(strokes)||strokes<1||strokes>20)throw Error('Invalid score');this.records.set(key(g,h),{golfer_index:g,team_index:golfers[g].team,hole:h,score:strokes});return {ok:true}}
 async read(g,h){return this.records.get(key(g,h))||null}
 async all(){return Array.from(this.records.values())}
}
test('23 isolated golfers: 414 score saves, independent point oracle, reload and team totals',async()=>{
 const db=new IsolatedScoreStore(),oracle=new Map();
 for(let h=1;h<=18;h++)for(let g=0;g<23;g++){
  const par=pars[h-1],strokes=Math.max(1,par+((g*7+h*3)%7)-3);
  await db.save(g,h,strokes);oracle.set(key(g,h),{strokes,pts:expectedPoints(strokes,par)});
 }
 assert.equal((await db.all()).length,414);
 for(let h=1;h<=18;h++)for(let g=0;g<23;g++){
  const saved=await db.read(g,h),want=oracle.get(key(g,h));
  assert.equal(saved.score,want.strokes);assert.equal(points(saved.score,pars[h-1]),want.pts);
 }
 const summary=summarize(state,await db.all(),pars,null);
 assert.equal(summary.completeHoles,18);
 for(let g=0;g<23;g++){
  const total=Array.from({length:18},(_,h)=>oracle.get(key(g,h+1)).pts).reduce((a,b)=>a+b,0);
  assert.equal(summary.players[g].points,total,'golfer '+g);
  assert.equal(summary.players[g].holes,18);
 }
 for(let ti=0;ti<2;ti++){
  const expected=teams[ti].roster.reduce((sum,g)=>sum+summary.players[g].points,0);
  assert.equal(summary.totals[ti].rawPoints,expected);
 }
 assert.equal(summary.totals[0].golfers,12);assert.equal(summary.totals[1].golfers,11);
 assert.equal(summary.totals[1].rankPoints,summary.totals[1].rawPoints/11*12);
});
test('parallel isolated saves do not overwrite other golfers, and edited score persists',async()=>{
 const db=new IsolatedScoreStore();
 await Promise.all(golfers.map((_,g)=>db.save(g,4,3+g%5)));
 assert.equal((await db.all()).length,23);
 await db.save(7,4,4);
 assert.equal((await db.all()).length,23);
 assert.equal((await db.read(7,4)).score,4);
 assert.equal((await db.read(8,4)).score,3+8%5);
 const reloaded=summarize(state,await db.all(),pars,null);
 assert.equal(reloaded.holes[3][0].entered,12);
 assert.equal(reloaded.holes[3][1].entered,11);
});
test('missing strokes and Gator bonus are not silently treated as complete',async()=>{
 const db=new IsolatedScoreStore();
 for(let g=0;g<23;g++)if(g!==22)await db.save(g,1,3);
 let result=summarize(state,await db.all(),pars,1);
 assert.equal(result.completeHoles,0);
 assert.deepEqual(result.gatorBonus,[0,0]);
 await db.save(22,1,3);
 result=summarize(state,await db.all(),pars,1);
 assert.equal(result.completeHoles,1);
 assert.deepEqual(result.gatorBonus,[5,5]);
});
test('pagination reads all 414 rows without truncation',async()=>{
 const db=new IsolatedScoreStore();
 for(let g=0;g<23;g++)for(let h=1;h<=18;h++)await db.save(g,h,pars[h-1]);
 const rows=await db.all();
 const client={from:()=>({select:()=>({eq:()=>({order:()=>({order:()=>({order:()=>({range:async(a,b)=>({data:rows.slice(a,b+1),count:rows.length,error:null})})})})})})})};
 const fetched=await fetchScores(client,'isolated-only');
 assert.equal(fetched.length,414);
});
