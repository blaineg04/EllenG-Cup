const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('scoring.html','utf8');
function directory(names,query=''){
 const root={innerHTML:''};
 const ctx={draftState:{golfers:names.map(name=>({name})),teams:[]},$:id=>id==='playerDirectory'?root:{value:query},golferTeamIndex:()=>null,playerBandLabel:()=> '—',publicPlayerAvatar:()=>'',esc:x=>String(x)};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function renderPlayersDirectory(){'),source.indexOf('function renderRankingsDirectory(){'))+';renderPlayersDirectory();',ctx);
 return [...root.innerHTML.matchAll(/data-player-profile="(\d+)"/g)].map(m=>Number(m[1]));
}
test('Players directory sorts by last name, then first name, preserving original profile indexes',()=>{
 assert.deepEqual(directory(['Aaron Bird','Brock Allen','Bobby Burt','Allan Legault','Luis F Rodriguez','Louie Rodriguez','Blaine Guy']),[1,0,2,6,3,5,4]);
});
test('Last-name sorting handles single names, spacing, case, and filtered results',()=>{
 assert.deepEqual(directory([' Zoe   Smith ','amy smith','Prince','Alex Allen']),[3,2,1,0]);
 assert.deepEqual(directory(['Zoe Smith','Burt Adams','Amy Smith'],'smith'),[2,0]);
});
