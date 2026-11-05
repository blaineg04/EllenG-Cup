const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('scoring.html','utf8');
function render(search='',unavailable=false){
 const elements={playerDirectory:{innerHTML:''},playerDirectorySearch:{value:search},playerDirectoryTotal:{textContent:''},playerDirectoryPlaying:{textContent:''}};
 const c={$:id=>elements[id],draftState:{golfers:[{name:'Playing Golfer'},{name:'Excluded Golfer',participating:false},{name:''}]},publicRoster:[{displayName:'Playing Golfer',participating:true,golferIndex:0,accountIndex:0},{displayName:'Excluded Golfer',participating:false,golferIndex:1,accountIndex:1},{displayName:'Registered Only',participating:false,golferIndex:null,accountIndex:9}],publicRosterUnavailable:unavailable,golferTeamIndex:()=>null,playerBandLabel:()=>'',publicPlayerAvatar:()=>'',esc:s=>s};
 const start=html.indexOf('function renderPlayersDirectory(){'),end=html.indexOf('function renderRankingsDirectory(){',start);vm.runInNewContext(html.slice(start,end),c);c.renderPlayersDirectory();return elements;
}
test('Players shows all golfers including account-only nonplayers once',()=>{assert.equal(render().playerDirectoryTotal.textContent,'Total golfers in app: 3')});
test('search and zero search results keep full app count',()=>{assert.equal(render('Playing').playerDirectoryTotal.textContent,'Total golfers in app: 3');assert.equal(render('no match').playerDirectoryTotal.textContent,'Total golfers in app: 3')});
test('unavailable account directory does not present a partial total as complete',()=>{assert.equal(render('',true).playerDirectoryTotal.textContent,'Total golfers in app: temporarily unavailable')});

test('tournament count includes named playing golfers only, regardless of search',()=>{
 for(const q of ['', 'Registered', 'no match'])assert.equal(render(q).playerDirectoryPlaying.textContent,'Playing in this tournament: 1');
});
test('playing count remains available when registered account retrieval fails',()=>{assert.equal(render('',true).playerDirectoryPlaying.textContent,'Playing in this tournament: 1')});
test('nonplayer descriptions omit account-preservation wording',()=>{const view=render().playerDirectory.innerHTML;assert.ok(view.includes('Not in this tournament'));assert.ok(!view.includes('Account preserved'))});
