const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../common.js'),'utf8');
const prefix=src.slice(0,src.indexOf('async function load()'));
function draft(teamCount,golferCount,type='snake',rules='banded'){
 const ctx={window:{ELLENG_CONFIG:{supabaseUrl:'https://example.invalid',supabaseAnonKey:'test',defaultTeamCount:teamCount,defaultGolferCount:golferCount},supabase:{createClient:()=>({})}}};
 vm.createContext(ctx);vm.runInContext(prefix,ctx);
 vm.runInContext(`S.draftType=${JSON.stringify(type)};S.draftRules=${JSON.stringify(rules)};S.golfers.forEach((g,i)=>{g.name='Golfer '+i;g.band=['A','B','C','D'][i%4]})`,ctx);
 return ctx;
}
test('snake and standard order remain deterministic for dynamic team counts',()=>{
 for(const t of [2,3,4,6,9])for(const count of [t,t+1,t*3+2]){
  for(const type of ['snake','straight']){
   const c=draft(t,count,type);
   const actual=Array.from({length:count},(_,n)=>c.order(n));
   const expected=Array.from({length:count},(_,n)=>{const round=Math.floor(n/t),slot=n%t;return type==='snake'&&round%2?t-1-slot:slot});
   assert.deepEqual(actual,expected);
   assert.equal(Array.from({length:t},(_,i)=>c.teamCapacity(i)).reduce((a,b)=>a+b,0),count);
   assert.ok(actual.every(x=>x>=0&&x<t));
  }
 }
});
test('banded drafting favors teams with fewer A/B players and open mode remains selectable',()=>{
 const c=draft(2,8);vm.runInContext('S.teams[0].roster=[0];S.golfers[0].team=0',c);
 assert.equal(c.canBand(0,'A'),false);
 assert.equal(c.canBand(1,'A'),true);
 vm.runInContext('S.draftRules="open"',c);
 assert.equal(c.canBand(0,'A'),true);
});
test('banded fallback offers a legal remaining rank with uneven roster mix',()=>{
 const c=draft(3,5);
 vm.runInContext('S.golfers.forEach((g,i)=>{if(i!==4)g.team=0;});S.teams[0].roster=[0,1,2,3]',c);
 assert.equal(c.canBand(2,'A'),true);
});

test('captain pick path rejects stale, off-turn, and ineligible attempts before calling draft RPC',()=>{
 const captain=fs.readFileSync(path.join(__dirname,'../captain.html'),'utf8');
 const start=captain.indexOf('async function pick(i){');const rpc=captain.indexOf('db.rpc("elleng_make_pick"',start);
 assert.ok(start>=0&&rpc>start);
 const pre=captain.slice(start,rpc);
 for(const guard of ['currentTeam!==myTeam','golfer.team!=null','!canBand(currentTeam,golfer.band)','S.picks.length>=totalPicks()'])assert.ok(pre.includes(guard),guard);
});

test('draft clock is derived from shared deadline and pauses consistently',()=>{
 const a=draft(3,9),b=draft(3,9);
 const deadline=new Date(Date.now()+60000).toISOString();
 for(const ctx of [a,b])vm.runInContext(`S.timerPaused=false;S.timerLength=60;S.timerEndsAt=${JSON.stringify(deadline)}`,ctx);
 const x=a.remaining(),y=b.remaining();
 assert.ok(Math.abs(x-y)<=1,`two viewers disagree: ${x}, ${y}`);
 assert.ok(x>=58&&x<=60);
 for(const ctx of [a,b])vm.runInContext('S.timerPaused=true;S.timerLength=27;S.timerEndsAt=null',ctx);
 assert.equal(a.remaining(),27);assert.equal(b.remaining(),27);
});
test('expired draft timer floors at zero, never becomes negative',()=>{
 const c=draft(2,4);
 vm.runInContext('S.timerPaused=false;S.timerEndsAt=new Date(Date.now()-9000).toISOString()',c);
 assert.equal(c.remaining(),0);
});
