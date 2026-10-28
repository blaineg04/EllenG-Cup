// Cross-page scoring contract: exercise the actual points functions from both pages.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function calculate(file,values,gator,splitPair=false){
 const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 const start=html.indexOf('function normalPoints(values){');
 const end=file==='scoring.html'?html.indexOf('function finalCargoBonus(){',start):html.indexOf('function totals(){',start);
 assert.ok(start>=0&&end>start,`Missing points functions in ${file}`);
 const ctx={teams:values.map((_,i)=>({name:'T'+i})),scores:values.map((score,i)=>({team_index:i,hole:4,score})),tournament:{gator_hole:gator?4:null},isSplitPair:()=>splitPair};
 vm.runInNewContext(html.slice(start,end),ctx);
 return Array.from(ctx.pointsForHole(4));
}
for(const n of [2,3,4,6,7,9]){
 for(const gator of [false,true]){
  test(`both scoring pages agree for ${n} teams, gator=${gator}`,()=>{
   const vals=Array.from({length:n},(_,i)=>3+i);
   assert.deepEqual(calculate('Scoring.html',vals,gator),calculate('scoring.html',vals,gator));
  });
 }
}
test('both pages hold incomplete hole points',()=>{
 for(const name of ['scoring.html','Scoring.html'])
  assert.deepEqual(calculate(name,[4,'',5],true),[null,null,null]);
});
test('both pages split tied Gator winners',()=>{
 for(const name of ['scoring.html','Scoring.html'])
  assert.deepEqual(calculate(name,[4,4,5,6],true),[4,4,0,0]);
});
