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

test('Gator Hole awards 10 only to the higher scoring team after every golfer finishes',()=>{
 const {summarize}=require('../shamble-points.js');
 const state={golfers:[{name:'A',team:0},{name:'B',team:0},{name:'C',team:1},{name:'D',team:1}],teams:[{roster:[0,1]},{roster:[2,3]}]};
 const pars=Array(18).fill(4);
 const rows=[{golfer_index:0,team_index:0,hole:7,score:3},{golfer_index:1,team_index:0,hole:7,score:4},{golfer_index:2,team_index:1,hole:7,score:4}];
 let x=summarize(state,rows,pars,7);
 assert.deepEqual(x.gatorBonus,[0,0]);assert.deepEqual(x.totals.map(t=>t.pts),[7,3]);
 rows.push({golfer_index:3,team_index:1,hole:7,score:5});
 x=summarize(state,rows,pars,7);
 assert.deepEqual(x.gatorBonus,[10,0]);assert.deepEqual(x.totals.map(t=>t.pts),[17,5]);
 assert.deepEqual(x.players.map(p=>p.points),[4,3,3,2]);
 assert.deepEqual(summarize(state,rows,pars,null).totals.map(t=>t.pts),[7,5]);
});
test('Gator Hole ties split 5 each and repeat score rows do not duplicate points',()=>{
 const {summarize}=require('../shamble-points.js');
 const state={golfers:[{name:'A',team:0},{name:'B',team:1}],teams:[{roster:[0]},{roster:[1]}]};
 const rows=[{golfer_index:0,team_index:0,hole:18,score:4},{golfer_index:1,team_index:1,hole:18,score:4}];
 const x=summarize(state,[...rows,rows[0]],Array(18).fill(4),18);
 assert.deepEqual(x.gatorBonus,[5,5]);assert.deepEqual(x.totals.map(t=>t.pts),[8,8]);
});

test('24 golfers across 18 holes: 432 scores, team attribution, correction and Gator Hole',()=>{
 const {summarize}=require('../shamble-points.js');
 const golfers=Array.from({length:24},(_,i)=>({name:'Simulated Golfer '+(i+1),team:i<12?0:1}));
 const state={golfers,teams:[{roster:Array.from({length:12},(_,i)=>i)},{roster:Array.from({length:12},(_,i)=>i+12)}]};
 const pars=Array(18).fill(4);
 const rows=golfers.flatMap((g,i)=>Array.from({length:18},(_,h)=>({golfer_index:i,team_index:g.team,hole:h+1,score:g.team===0?4:5})));
 assert.equal(rows.length,432);
 let x=summarize(state,rows,pars,9);
 assert.equal(x.completeHoles,18);
 assert.deepEqual(x.totals.map(t=>t.pts),[658,432]);
 assert.deepEqual(x.gatorBonus,[10,0]);
 assert(x.players.slice(0,12).every(p=>p.points===54&&p.holes===18));
 assert(x.players.slice(12).every(p=>p.points===36&&p.holes===18));
 assert(x.holes.every(h=>h.every(t=>t.entered===12&&t.expected===12&&t.complete)));
 // A golfer's correction replaces the saved value, never adds another score.
 const corrected=rows.map(r=>r.golfer_index===0&&r.hole===1?{...r,score:3}:r);
 x=summarize(state,corrected,pars,9);
 assert.deepEqual(x.totals.map(t=>t.pts),[659,432]);
 assert.equal(x.players[0].points,55);
 // Duplicate data from a stale response cannot inflate a team total.
 x=summarize(state,[...corrected,corrected[0]],pars,9);
 assert.deepEqual(x.totals.map(t=>t.pts),[659,432]);
 // With a single missing submission the selected hole cannot award the bonus.
 x=summarize(state,rows.filter(r=>!(r.golfer_index===23&&r.hole===9)),pars,9);
 assert.deepEqual(x.gatorBonus,[0,0]);
 assert.equal(x.completeHoles,17);
 assert.deepEqual(x.totals.map(t=>t.pts),[648,430]);
});
