// EllenG Cup draft-band reference tests. Run: node --test tests/auto-pick-balance.test.cjs
// Tests the expected eligibility algorithm, not the deployed PostgreSQL RPC.
const {test}=require('node:test');
const assert=require('node:assert/strict');
function penalty(s,t,b){
 const count=(i,x)=>(s.teams[i].roster||[]).filter(j=>s.golfers[j]?.band===x).length;
 const ab=i=>count(i,'A')+count(i,'B');
 return count(t,b)-Math.min(...s.teams.map((_,i)=>count(i,b)))+
 (['A','B'].includes(b)?ab(t)-Math.min(...s.teams.map((_,i)=>ab(i))):0);
}
function eligible(s,t,mode){
 const pool=s.golfers.map((g,i)=>({...g,i})).filter(g=>g.name&&(g.team===undefined||g.team===null));
 if(mode==='open')return pool.map(g=>g.i);
 const ranked=pool.filter(g=>['A','B','C','D'].includes(g.band));
 if(!ranked.length)return [];
 const min=Math.min(...ranked.map(g=>penalty(s,t,g.band)));
 return ranked.filter(g=>penalty(s,t,g.band)===min).map(g=>g.i);
}
const f=(teams,golfers)=>({teams:teams.map(roster=>({roster})),golfers});
const g=(name,band,team)=>({name,band,...(team===undefined?{}:{team})});
const cases=[
 ['balanced two teams',f([[],[]],[g('a','A'),g('b','B'),g('c','C'),g('d','D')]),0,'banded',[0,1,2,3]],
 ['A/B strength imbalance',f([[0],[]],[g('taken','A',0),g('a','A'),g('b','B'),g('c','C'),g('d','D')]),0,'banded',[3,4]],
 ['open ignores penalty',f([[0],[]],[g('taken','A',0),g('a','A'),g('b','B'),g('c','C'),g('d','D')]),0,'open',[1,2,3,4]],
 ['three uneven teams',f([[0],[],[1]],[g('taken A','A',0),g('taken B','B',2),g('a','A'),g('b','B'),g('c','C'),g('d','D')]),1,'banded',[2,3,4,5]],
 ['invalid rank and blank',f([[],[]],[g('','A'),g('bad','X'),g('good','C')]),0,'banded',[2]],
 ['empty pool',f([[],[]],[]),0,'banded',[]],
 ['all assigned',f([[0],[1]],[g('taken A','A',0),g('taken B','B',1)]),0,'banded',[]],
 ['single team',f([[]],[g('a','A'),g('b','B')]),0,'banded',[0,1]],
 ['open allows unranked',f([[],[]],[g('unranked',''),g('ranked','C')]),0,'open',[0,1]],
 ['banded excludes unranked',f([[],[]],[g('unranked','')]),0,'banded',[]],
];
for(const [name,state,team,mode,want] of cases){
 test(name,()=>assert.deepEqual(eligible(state,team,mode),want));
}
