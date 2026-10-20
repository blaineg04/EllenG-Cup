// Run with: node --test tests/draft-logic.test.cjs
// No network calls, Supabase credentials, or writes to tournament data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeDraft({teams=7,players=27,type='snake',rules='banded'}={}) {
  const source=fs.readFileSync(path.join(__dirname,'..','common.js'),'utf8');
  const sandbox={
    window:{
      ELLENG_CONFIG:{supabaseUrl:'https://example.invalid',supabasePublishableKey:'test-only',defaultTeamCount:teams,defaultGolferCount:players},
      supabase:{createClient:()=>({})}
    },
    Date, Math, Number, String, Set
  };
  vm.createContext(sandbox);
  vm.runInContext(source,sandbox,{filename:'common.js'});
  vm.runInContext('S.draftType='+JSON.stringify(type)+';S.draftRules='+JSON.stringify(rules)+';',sandbox);
  return {
    order:n=>vm.runInContext('order('+n+')',sandbox),
    capacity:t=>vm.runInContext('teamCapacity('+t+')',sandbox),
    setGolfers:bands=>vm.runInContext('S.golfers.forEach((g,i)=>{g.name="Player "+i;g.band='+JSON.stringify(bands)+'[i]||"C";});',sandbox),
    canBand:(t,b)=>vm.runInContext('canBand('+t+','+JSON.stringify(b)+')',sandbox),
    bandCount:(t,b)=>vm.runInContext('tbc('+t+','+JSON.stringify(b)+')',sandbox),
    abCount:t=>vm.runInContext('teamABCount('+t+')',sandbox),
    addPick:(t,player)=>vm.runInContext('S.teams['+t+'].roster.push('+player+');S.golfers['+player+'].team='+t+';',sandbox)
  };
}

test('27 golfers across 7 snake teams have correct uneven capacities',()=>{
  const d=makeDraft();
  assert.deepEqual(Array.from({length:7},(_,i)=>d.capacity(i)),[3,4,4,4,4,4,4]);
});

test('snake draft reverses every other round',()=>{
  const d=makeDraft({teams:4,players:12});
  assert.deepEqual(Array.from({length:12},(_,i)=>d.order(i)),[0,1,2,3,3,2,1,0,0,1,2,3]);
});

test('standard draft keeps the same team order',()=>{
  const d=makeDraft({teams:4,players:12,type:'standard'});
  assert.deepEqual(Array.from({length:12},(_,i)=>d.order(i)),[0,1,2,3,0,1,2,3,0,1,2,3]);
});

test('24 golfers across 6 teams each have four picks',()=>{
  const d=makeDraft({teams:6,players:24});
  assert.deepEqual(Array.from({length:6},(_,i)=>d.capacity(i)),[4,4,4,4,4,4]);
});

test('open draft permits valid team selection',()=>{
  const d=makeDraft({teams:2,players:4,rules:'open'});
  assert.equal(d.canBand(0,'A'),true);
  assert.equal(d.canBand(1,'D'),true);
  assert.equal(d.canBand(2,'A'),false);
});

test('banded draft requires a remaining ranked golfer',()=>{
  const d=makeDraft({teams:2,players:4});
  assert.equal(d.canBand(0,'A'),false);
  d.setGolfers(['A','B','C','D']);
  assert.equal(d.canBand(0,'A'),true);
  assert.equal(d.canBand(0,'Z'),false);
});

test('uneven rank mix falls back to the best remaining band',()=>{
 const d=makeDraft({teams:2,players:4});
 d.setGolfers(['A','A','B','C']);
 d.addPick(0,0);
 d.addPick(0,2);
 assert.equal(d.canBand(0,'A'),false);
 assert.equal(d.canBand(0,'C'),true);
 d.addPick(1,3);
 assert.equal(d.canBand(0,'A'),true);
});

test('no remaining golfers means no legal band',()=>{
 const d=makeDraft({teams:2,players:2});
 d.setGolfers(['A','B']);
 d.addPick(0,0);
 d.addPick(1,1);
 assert.equal(d.canBand(0,'A'),false);
 assert.equal(d.canBand(1,'B'),false);
});

test('band penalty uses combined A/B imbalance rather than independent band counts alone',()=>{
 const d=makeDraft({teams:2,players:6});
 d.setGolfers(['A','B','A','B','C','D']);
 d.addPick(0,0);
 d.addPick(0,1);
 d.addPick(1,4);
 assert.equal(d.canBand(0,'A'),false);
 assert.equal(d.canBand(0,'B'),false);
 assert.equal(d.canBand(0,'D'),true);
});

test('a single remaining valid golfer stays eligible even with a balance penalty',()=>{
 const d=makeDraft({teams:2,players:3});
 d.setGolfers(['A','A','B']);
 d.addPick(0,0);
 d.addPick(1,2);
 assert.equal(d.canBand(0,'A'),true);
});

test('legacy automatic selection can dead-end when manual fallback remains legal',()=>{
 const d=makeDraft({teams:2,players:4});
 d.setGolfers(['A','A','B','C']);
 d.addPick(0,0);
 d.addPick(0,2);
 d.addPick(1,3);
 // The remaining A golfer has a positive band-balance penalty for team 0.
 // The manual lowest-penalty fallback still allows that sole remaining band.
 assert.equal(d.canBand(0,'A'),true);
 // Legacy auto-pick checks for zero band imbalance and would reject it.
 const legacyBandEligible=d.bandCount(0,'A')===Math.min(d.bandCount(0,'A'),d.bandCount(1,'A'));
 const legacyAbEligible=d.abCount(0)===Math.min(d.abCount(0),d.abCount(1));
 assert.equal(legacyBandEligible&&legacyAbEligible,false);
});

test('automatic zero-imbalance model and manual fallback differ on a reachable synthetic roster',()=>{
 const d=makeDraft({teams:2,players:4});
 d.setGolfers(['A','A','B','C']);
 d.addPick(0,0);
 d.addPick(0,2);
 d.addPick(1,3);
 const remaining=['A'];
 const manualCandidates=remaining.filter(b=>d.canBand(0,b));
 const legacyCandidates=remaining.filter(b=>{
   const bandMin=Math.min(...[0,1].map(t=>d.bandCount(t,b)));
   const abMin=Math.min(...[0,1].map(t=>d.abCount(t)));
   return d.bandCount(0,b)===bandMin && d.abCount(0)===abMin;
 });
 assert.deepEqual(manualCandidates,['A']);
 assert.deepEqual(legacyCandidates,[]);
});

test('two-team head-to-head snake drafts scale to arbitrary roster sizes',()=>{
 for(const players of [2,3,7,8,15,22,29,36]){
  const d=makeDraft({teams:2,players});
  const counts=[d.capacity(0),d.capacity(1)];
  assert.equal(counts[0]+counts[1],players);
  assert.ok(Math.abs(counts[0]-counts[1])<=1);
  const order=Array.from({length:players},(_,i)=>d.order(i));
  assert.ok(order.every(t=>t===0||t===1));
  assert.deepEqual([0,1,1,0].slice(0,Math.min(4,players)),order.slice(0,4));
 }
});

test('standard and snake drafts allocate all golfers once with changing team counts',()=>{
 for(const teams of [2,3,4,5,6,7,8,9,12]){
  for(const players of [teams,teams+1,teams*4,teams*4+1]){
   for(const type of ['snake','standard']){
    const d=makeDraft({teams,players,type,rules:'open'});
    const order=Array.from({length:players},(_,i)=>d.order(i));
    assert.equal(new Set(order).size,teams);
    assert.ok(order.every(team=>team>=0&&team<teams));
    assert.equal(Array.from({length:teams},(_,i)=>d.capacity(i)).reduce((a,b)=>a+b,0),players);
    const actual=Array.from({length:teams},(_,i)=>order.filter(team=>team===i).length);
    assert.deepEqual(Array.from({length:teams},(_,i)=>d.capacity(i)),actual);
   }
  }
 }
});
