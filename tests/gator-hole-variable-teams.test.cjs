// Regression contract for Gator Hole variable-team bonus and ties.
// Run with: node --test tests/gator-hole-variable-teams.test.cjs
const test=require('node:test');
const assert=require('node:assert/strict');
function holePoints(values,{gator=false}={}){
 const n=values.length;
 if(!n||values.some(v=>!Number.isInteger(v)||v<1))return Array(n).fill(null);
 if(gator){const min=Math.min(...values),w=values.filter(v=>v===min).length;return values.map(v=>v===min?2*n/w:0);}
 const ordered=values.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v),out=Array(n);
 for(let p=0;p<n;){let q=p+1;while(q<n&&ordered[q].v===ordered[p].v)q++;
  const share=Array.from({length:q-p},(_,k)=>n-(p+k)).reduce((a,b)=>a+b,0)/(q-p);
  for(let i=p;i<q;i++)out[ordered[i].i]=share;p=q;
 }return out;
}
for(const n of [2,3,4,6,7,9]){
 test(`Gator Hole awards twice first-place points with ${n} teams`,()=>{
  const scores=Array.from({length:n},(_,i)=>i+3),got=holePoints(scores,{gator:true});
  assert.equal(got[0],2*n);assert.ok(got.slice(1).every(v=>v===0));
 });
 test(`Gator Hole splits bonus among tied lowest of ${n} teams`,()=>{
  const scores=Array.from({length:n},(_,i)=>i<2?3:i+4),got=holePoints(scores,{gator:true});
  assert.deepEqual(got.slice(0,2),[n,n]);assert.ok(got.slice(2).every(v=>v===0));
 });
}
test('normal-hole tie shares standard placing points',()=>assert.deepEqual(holePoints([4,4,5,6]),[3.5,3.5,2,1]));
test('an incomplete or invalid hole cannot award points',()=>assert.deepEqual(holePoints([3,NaN,5],{gator:true}),[null,null,null]));
