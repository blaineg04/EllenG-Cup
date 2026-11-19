// Isolated 20-golfer load rehearsal. No network, accounts, or production writes.
'use strict';
const assert=require('node:assert/strict');
const scoring=require('../shamble-points.js');
const golfers=Array.from({length:20},(_,i)=>({name:'Fixture '+(i+1),team:i<10?0:1,participating:true}));
const state={golfers,teams:[{name:'Fixture A',roster:Array.from({length:10},(_,i)=>i)},{name:'Fixture B',roster:Array.from({length:10},(_,i)=>i+10)}]};
const pars=Array.from({length:18},(_,i)=>[3,4,5][i%3]);
const submitted=[];
for(let hole=1;hole<=18;hole++)for(let gi=0;gi<20;gi++)
 submitted.push({golfer_index:gi,team_index:gi<10?0:1,hole,score:Math.max(1,pars[hole-1]+((gi*7+hole*3)%7)-3)});
const store=new Map();
const key=r=>r.golfer_index+':'+r.hole;
async function save(r){
 await Promise.resolve(); // concurrent in-flight submissions, no network
 store.set(key(r),r);
 const persisted=store.get(key(r));
 assert.equal(persisted.score,r.score,'score must read back after save');
}
(async()=>{
 await Promise.all(submitted.map(save));
 assert.equal(store.size,360,'all 360 golfer/hole pairs must persist');
 const rows=[...store.values()];
 const x=scoring.summarize(state,rows,pars,9);
 assert.equal(x.completeHoles,18);
 assert.ok(x.players.every(p=>p.holes===18));
 const base=[0,0],gator=[0,0];
 for(const r of submitted){const p=scoring.points(r.score,pars[r.hole-1]);base[r.team_index]+=p;if(r.hole===9)gator[r.team_index]+=p;}
 const bonus=gator[0]===gator[1]?[5,5]:gator[0]>gator[1]?[10,0]:[0,10];
 assert.deepEqual(x.gatorBonus,bonus);
 assert.deepEqual(x.totals.map(t=>t.pts),base.map((v,i)=>v+bonus[i]));
 const pageCalls=[];
 const client={from:()=>({select:()=>({eq:()=>({order:()=>({order:()=>({order:()=>({range:async(a,b)=>{pageCalls.push([a,b]);return {data:rows.slice(a,b+1),count:rows.length,error:null};}})})})})})})};
 const fetched=await scoring.fetchScores(client,'fixture-only');
 assert.equal(fetched.length,360,'complete score readback');
 assert.deepEqual(pageCalls,[[0,499]]);
 // Retest an uneven roster with one withdrawn golfer and no scores counted for them.
 const uneven={golfers:golfers.map((g,i)=>({...g,participating:i!==19})),teams:[{name:'Fixture A',roster:Array.from({length:11},(_,i)=>i)},{name:'Fixture B',roster:Array.from({length:9},(_,i)=>i+11)}]};
 const unevenRows=submitted.map(r=>({...r,team_index:r.golfer_index<11?0:1}));
 const y=scoring.summarize(uneven,unevenRows,pars,9);
 assert.equal(y.completeHoles,18);
 assert.deepEqual(y.totals.map(t=>t.golfers),[11,8]);
 assert.equal(y.players[19].holes,0);
 assert.equal(y.players.reduce((n,p)=>n+p.holes,0),342);
 console.log('PASS: 20 golfers, 360 concurrent mock saves/readbacks, 18 holes, Gator, uneven roster, withdrawal');
})().catch(e=>{console.error(e);process.exitCode=1});
