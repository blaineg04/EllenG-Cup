const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync(require('node:path').join(__dirname,'../scoring.html'),'utf8');
const fn=source.slice(source.indexOf('function renderPlayersDirectory(){'),source.indexOf('\nfunction renderRankingsDirectory(){'));
function render(golfers,publicRoster){
 const els={playerDirectory:{},playerDirectoryTotal:{},playerDirectoryPlaying:{}};
 const ctx={draftState:{golfers},publicRoster,publicRosterUnavailable:false,$:id=>els[id],golferTeamIndex:()=>null,playerBandLabel:()=> '—',publicPlayerAvatar:()=>'',esc:s=>String(s)};
 vm.createContext(ctx);vm.runInContext(fn,ctx);vm.runInContext('renderPlayersDirectory()',ctx);return els;
}
const golfers=Array.from({length:62},()=>({name:'',participating:false}));
golfers[56]={name:'Connor Castille',participating:false};golfers[61]={name:'Charron Comeaux',participating:false};
const cached=[{displayName:'Connor Castille',participating:false,golferIndex:null,accountIndex:56},{displayName:'Charron Comeaux',participating:false,golferIndex:null,accountIndex:61}];
const result=render(golfers,cached);
assert.equal(result.playerDirectoryTotal.textContent,'Total golfers in app: 2');
assert.equal((result.playerDirectory.innerHTML.match(/class="player-name-public"/g)||[]).length,2);
assert.equal(result.playerDirectoryPlaying.textContent,'Playing in this tournament: 0');
const fresh=render(golfers,cached.map(a=>({...a,golferIndex:a.accountIndex})));
assert.equal(fresh.playerDirectoryTotal.textContent,'Total golfers in app: 2');
const separate=render([{name:'Same Name',participating:true}],[{displayName:'Same Name',participating:false,golferIndex:null,accountIndex:1}]);
assert.equal(separate.playerDirectoryTotal.textContent,'Total golfers in app: 2');
console.log('PASS: stale/fresh roster deduplication, participation count, distinct same-name golfers');
