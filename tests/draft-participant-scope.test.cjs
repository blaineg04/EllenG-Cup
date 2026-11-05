const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const common=fs.readFileSync('common.js','utf8'),admin=fs.readFileSync('admin.html','utf8'),captain=fs.readFileSync('captain.html','utf8');
test('draft capacity counts playing golfers across reserved index gaps',()=>{
 const S={golfers:[{name:'First'},{name:'Reserve',participating:false},{name:'',participating:false},{name:'Last'}],teams:[{},{}],draftType:'snake'};
 const fn=common.slice(common.indexOf('function totalPicks(){'),common.indexOf('/*',common.indexOf('function totalPicks(){')));
 assert.equal(vm.runInNewContext(fn+';totalPicks()',{S}),2);
});
test('commissioner pool excludes named nonplaying accounts without renumbering',()=>{
 const fn=admin.slice(admin.indexOf('function liveRender(){'),admin.indexOf('\nfunction drawClock()'));
 const els=new Proxy({}, {get:(o,k)=>o[k]||(o[k]={})});
 const S={golfers:[{name:'Playing',team:null,band:'C'},{name:'Reserve',team:null,band:'A',participating:false}],teams:[{name:'Team 1',roster:[]},{name:'Team 2',roster:[]}],picks:[]};
 const ctx={S,document:{getElementById:id=>els[id],querySelectorAll:()=>[]},order:()=>0,esc:String,canBand:()=>true,bands:['A','B','C','D'],tbc:()=>0,teamCapacity:()=>1,drawClock:()=>{}};
 vm.runInNewContext(fn+';liveRender()',ctx);assert.match(els.pool.innerHTML,/Playing/);assert.doesNotMatch(els.pool.innerHTML,/Reserve/);
});
test('captain rejects direct submission of a nonplaying golfer',()=>{
 const fn=captain.slice(captain.indexOf('function canSubmitCaptainPick(i){'),captain.indexOf('\nasync function pick(i)',captain.indexOf('function canSubmitCaptainPick(i){')));
 const ctx={S:{golfers:[{name:'Reserve',participating:false,team:null,band:'A'}],timerPaused:false,picks:[]},pickSyncFailed:false,captainRoleRefreshPending:false,captainUserId:'captain',captainSessionForegroundOnline:()=>true,document:{getElementById:()=>({textContent:'LIVE'})},totalPicks:()=>2,order:()=>0,myTeam:0,canBand:()=>true};
 assert.equal(vm.runInNewContext(fn+';canSubmitCaptainPick(0)',ctx),false);
});
