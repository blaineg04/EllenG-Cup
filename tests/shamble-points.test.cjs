const {test}=require('node:test'),assert=require('node:assert/strict');
test('paginated score reads include all 1080 rows beyond the API row cap',async()=>{
 const {fetchScores}=require('../shamble-points.js');const all=Array.from({length:1080},(_,i)=>({id:i}));let requests=0;
 const client={from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:(a,b)=>{requests++;return Promise.resolve({data:all.slice(a,b+1),count:all.length,error:null})}};return q}};
 assert.deepEqual(await fetchScores(client,'test'),all);assert.equal(requests,3);
});
test('all stroke outcomes award 5–4–3–2–1–0 with five-point maximum',()=>{
 const {points}=require('../shamble-points.js');assert.deepEqual([1,2,3,4,5,6,7,20].map(s=>points(s,4)),[5,5,4,3,2,1,0,0]);
 for(const bad of [null,undefined,'',true,0,-1,1.5,21])assert.equal(points(bad,4),null);
});
test('60 golfers completing all 18 holes contribute exactly once to their two teams',()=>{
 const {summarize}=require('../shamble-points.js');const golfers=Array.from({length:60},(_,i)=>({name:'Golfer '+i,team:i%2}));const state={golfers,teams:[{roster:golfers.map((_,i)=>i).filter(i=>i%2===0)},{roster:golfers.map((_,i)=>i).filter(i=>i%2===1)}]};
 const rows=golfers.flatMap((g,i)=>Array.from({length:18},(_,j)=>({golfer_index:i,team_index:g.team,hole:j+1,score:4})));
 const x=summarize(state,rows,Array(18).fill(4));assert.deepEqual(x.totals.map(t=>t.pts),[1620,1620]);assert.equal(x.completeHoles,18);assert(x.players.every(p=>p.points===54&&p.holes===18));
});
test('every golfer counts across all 18 holes, unequal rosters and clears',()=>{
 const {summarize}=require('../shamble-points.js');const golfers=Array.from({length:7},(_,i)=>({name:'Player '+i,team:i<4?0:1}));
 const state={golfers,teams:[{roster:[0,1,2,3]},{roster:[4,5,6]}]};
 let rows=[4,3,5,6,4,4,7].map((score,golfer_index)=>({score,golfer_index,team_index:golfer_index<4?0:1,hole:1}));
 let x=summarize(state,rows,Array(18).fill(4));assert.deepEqual(x.totals.map(t=>t.pts),[10,6]);assert.deepEqual(x.totals.map(t=>t.thru),[1,1]);assert.equal(x.completeHoles,1);
 rows.push({score:2,golfer_index:0,team_index:0,hole:18});x=summarize(state,rows,Array(18).fill(4));assert.equal(x.totals[0].pts,15);assert.equal(x.players[0].points,8);
 rows=rows.filter(r=>r.golfer_index!==0);x=summarize(state,rows,Array(18).fill(4));assert.equal(x.totals[0].pts,7);assert.equal(x.completeHoles,0);
});
test('unlimited roster size, missing scores and stale or malformed entries cannot inflate points',()=>{
 const {summarize}=require('../shamble-points.js');const golfers=Array.from({length:60},(_,i)=>({name:'Golfer '+i,team:i%2}));const state={golfers,teams:[{roster:golfers.map((g,i)=>i).filter(i=>i%2===0)},{roster:golfers.map((g,i)=>i).filter(i=>i%2===1)}]};
 const rows=golfers.map((g,i)=>({golfer_index:i,team_index:g.team,hole:1,score:4}));rows.push({...rows[0]},{...rows[0],team_index:1},{...rows[0],hole:19},{...rows[0],golfer_index:99});
 const x=summarize(state,rows,Array(18).fill(4));assert.deepEqual(x.totals.map(t=>t.pts),[90,90]);assert.equal(x.completeHoles,1);
});
