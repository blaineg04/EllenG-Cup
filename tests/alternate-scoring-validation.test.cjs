// Execute the alternate scoring page's REAL points functions in isolation.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','Scoring.html'),'utf8');
const start=html.indexOf('function normalPoints(values){');
const end=html.indexOf('function totals(){',start);
assert.ok(start>=0&&end>start,'alternate scoring functions not located');
function award(values,{gator=false,hole=4}={}){
 const ctx={teams:values.map((_,i)=>({name:'team '+i})),scores:values.map((score,i)=>({hole:4,team_index:i,score})),tournament:{gator_hole:gator?4:null},isSplitPair:()=>false};
 vm.runInNewContext(html.slice(start,end),ctx);
 return Array.from(ctx.pointsForHole(hole));
}
test('empty strings do not post team points',()=>assert.deepEqual(award([4,'',5],{gator:true}),[null,null,null]));
test('zero, negative, decimal and nonnumber are incomplete scores',()=>{for(const v of [0,-1,1.5,'abc',null,undefined])assert.deepEqual(award([4,v,5]),[null,null,null]);});
test('ties share normal placing points',()=>assert.deepEqual(award([4,4,5,6]),[3.5,3.5,2,1]));
test('Gator bonus scales with teams and splits tied winners',()=>{for(const n of [2,3,4,6,7,9]){const a=Array.from({length:n},(_,i)=>i+3);assert.deepEqual(award(a,{gator:true}),[2*n,...Array(n-1).fill(0)]);}});
test('hole identifiers must be 1 through 18',()=>{for(const h of [0,19,'',null,1.5])assert.deepEqual(award([3,4],{gator:true,hole:h}),[null,null]);});
