const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const file='weighted-draft.js';
const api=fs.existsSync(file)?require('../weighted-draft.js'):{};
const make=(bands)=>({teams:[{captain:'Captain A',roster:[0]},{captain:'Captain B',roster:[1]}],golfers:bands.map((band,i)=>({name:i===0?'Captain A':i===1?'Captain B':'Golfer '+i,band,self_ranked:true,team:i<2?i:null})),picks:[{golfer:0,team:0},{golfer:1,team:1}],draftType:'snake',timerPaused:true});
// Independent oracle enumerates player subsets rather than band counts.
function oracle(s){const active=s.golfers.map((g,i)=>({...g,i})).filter(g=>g.name&&g.participating!==false);const cap=[0,0];for(let i=0;i<active.length;i++)cap[Math.floor(i/2)%2?1-i%2:i%2]++;
 const pool=active.filter(g=>g.team==null),fixed=active.filter(g=>g.team!=null);let best=null,allowed=[new Set(),new Set()];
 for(let mask=0;mask<2**pool.length;mask++){const allocation=[fixed.filter(g=>g.team===0),fixed.filter(g=>g.team===1)];pool.forEach((g,i)=>allocation[(mask>>i)&1].push(g));if(allocation.some((a,t)=>a.length!==cap[t]))continue;
 const counts=allocation.map(a=>'ABCD'.split('').map(b=>a.filter(g=>g.band===b).length));const weights=allocation.map(a=>a.reduce((n,g)=>n+[5,3,2,1]['ABCD'.indexOf(g.band)],0));const score=[Math.abs(weights[0]*cap[1]-weights[1]*cap[0]),counts[0].reduce((n,c,b)=>n+(c*cap[1]-counts[1][b]*cap[0])**2,0)];
 if(!best||score[0]<best[0]||score[0]===best[0]&&score[1]<best[1]){best=score;allowed=[new Set(),new Set()];}
 if(score[0]===best[0]&&score[1]===best[1])pool.forEach((g,i)=>allowed[(mask>>i)&1].add(g.band));}
 for(let t=0;t<2;t++)for(const band of ['A','B']){
  const other=1-t,remaining=active.filter(g=>g.team==null&&g.band===band).length;
  if(fixed.filter(g=>g.team===t&&g.band===band).length>0&&
     fixed.filter(g=>g.team===other&&g.band===band).length===0&&
     remaining>0&&allocationCapacity(other)>0)allowed[t].delete(band);
 }
 function allocationCapacity(t){return cap[t]-fixed.filter(g=>g.team===t).length;}
 return {best,eligible:allowed.map(x=>[...x].sort())};}
test('weighted engine exists',()=>assert.equal(typeof api.options,'function'));
for(const bands of ['ABBBCCDD','AABBCCDD','BBBBCCDD','ABDD','ACBBBBCCD','ADDDDD','AB'])test('optimal completions match independent subsets '+bands,()=>{assert.equal(typeof api.options,'function');const s=make([...bands]);const result=api.options(s),expected=oracle(s);assert.deepEqual(result.score,expected.best);assert.deepEqual(result.eligible,expected.eligible);});
test('only A on strong captain team is offset by B depth',()=>{assert.equal(typeof api.options,'function');const s=make([...'ABBBCC']);const result=api.options(s);assert.deepEqual(result.eligible[1],['B']);assert.deepEqual(result.eligible[0],['C']);});
test('excluded golfers do not alter balance',()=>{assert.equal(typeof api.options,'function');const s=make([...'ABBBCC']);const before=api.options(s);s.golfers.push({name:'Not playing',band:'A',self_ranked:false,participating:false});assert.deepEqual(api.options(s),before);});
test('unsubmitted bands block weighted calculation',()=>{assert.equal(typeof api.options,'function');const s=make([...'ABBBCC']);s.golfers[2].self_ranked=false;assert.throws(()=>api.options(s),/submitted/);});
test('every legal path finishes at the original optimal score',()=>{assert.equal(typeof api.options,'function');const start=make([...'ABBBCCDD']);const target=api.options(start).score;let leaves=0;function walk(s){const pool=s.golfers.map((g,i)=>({...g,i})).filter(g=>g.team==null);const options=api.options(s);if(!pool.length){assert.deepEqual(options.score,target);leaves++;return;}const n=s.picks.length,t=Math.floor(n/2)%2?1-n%2:n%2;const choices=pool.filter(g=>options.eligible[t].includes(g.band));assert.ok(choices.length);for(const g of choices){const next=structuredClone(s);next.golfers[g.i].team=t;next.teams[t].roster.push(g.i);next.picks.push({golfer:g.i,team:t});walk(next);}}walk(start);assert.ok(leaves>0);});
test('prepare seeds matching captains exactly once and stays paused',()=>{assert.equal(typeof api.prepare,'function');const s=make([...'ABBBCC']);s.teams.forEach(t=>t.roster=[]);s.golfers.forEach(g=>g.team=null);s.picks=[];const p=api.prepare(s);assert.equal(p.draftRules,'weighted');assert.equal(p.balanceVersion,1);assert.equal(p.timerPaused,true);assert.deepEqual(p.teams.map(t=>t.roster),[[0],[1]]);assert.deepEqual(api.prepare(p),p);assert.equal(s.picks.length,0);});
test('prepare refuses ambiguous captains and preserves ordinary picks',()=>{assert.equal(typeof api.prepare,'function');const s=make([...'ABBBCC']);s.teams[1].captain=s.teams[0].captain;assert.throws(()=>api.prepare(s),/captain/i);const p=make([...'ABBBCC']);p.golfers[2].team=1;p.teams[1].roster.push(2);p.picks.push({golfer:2,team:1});assert.throws(()=>api.prepare(p),/ordinary picks/);});
test('common eligibility uses weighted engine and rejects missing module',()=>{const code=fs.readFileSync('common.js','utf8');const ctx={window:{ELLENG_CONFIG:{supabaseUrl:'https://example.invalid',supabaseAnonKey:'test'},supabase:{createClient:()=>({})}},console,structuredClone,Set,Date};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);assert.equal(typeof api.options,'function');ctx.EllenGWeightedDraft=api;ctx.fixture=api.prepare(make([...'ABBBCC']));vm.runInContext('S=fixture',ctx);assert.equal(vm.runInContext("canBand(0,'B')",ctx),false);assert.equal(vm.runInContext("canBand(1,'B')",ctx),true);delete ctx.EllenGWeightedDraft;assert.equal(vm.runInContext("canBand(1,'B')",ctx),false);});
test('weighted mode refuses missing captain seeds',()=>{const s=api.prepare(make([...'ABBBCC']));s.picks.pop();s.golfers[1].team=null;s.teams[1].roster=[];assert.throws(()=>api.options(s),/captain seeds/i);});

test('23-player Jarad A / Carl B snake draft gives both teams a first B before any second B',()=>{
 const bands=['A','B',...Array(4).fill('B'),...Array(13).fill('C'),...Array(4).fill('D')];
 const s=make(bands);
 s.teams[0].captain='Jarad';s.golfers[0].name='Jarad';
 s.teams[1].captain='Carl';s.golfers[1].name='Carl';
 const start=api.prepare({...s,teams:s.teams.map(t=>({...t,roster:[]})),golfers:s.golfers.map(g=>({...g,team:null})),picks:[]});
 let state=start;
 while(state.picks.length<23){
  const n=state.picks.length,team=Math.floor(n/2)%2?1-n%2:n%2;
  const allowed=api.options(state).eligible[team];
  const choices=state.golfers.map((g,i)=>({...g,i})).filter(g=>g.team==null&&allowed.includes(g.band));
  assert.ok(choices.length,'legal pick exists at '+n);
  const bCounts=state.teams.map(t=>t.roster.filter(i=>state.golfers[i].band==='B').length);
  if(bCounts[team]>0&&bCounts[1-team]===0&&bCounts[0]+bCounts[1]<5)
   assert.ok(!allowed.includes('B'),'second B blocked until opposing first B');
  const next=structuredClone(state),chosen=choices[0];
  next.golfers[chosen.i].team=team;next.teams[team].roster.push(chosen.i);next.picks.push({golfer:chosen.i,team});
  state=next;
 }
 assert.deepEqual(state.teams.map(t=>t.roster.length),[11,12]);
 const strengths=state.teams.map(t=>t.roster.reduce((n,i)=>n+[5,3,2,1]['ABCD'.indexOf(state.golfers[i].band)],0));
 assert.ok(Math.abs(strengths[0]/11-strengths[1]/12)<=0.1,'normalized team strength remains close: '+strengths);
});
