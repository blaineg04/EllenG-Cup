const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const file of ['draft.html','captain.html','admin.html'])test(file+' shows only submitted bands, including range-only submissions',()=>{
 const source=fs.readFileSync(file,'utf8'),name=file==='admin.html'?'liveRender':'render',start=source.indexOf('function '+name+'(){'),end=source.indexOf('\nfunction ',start+20),fn=source.slice(start,end);
 const elements=new Proxy({}, {get:(o,k)=>o[k]||(o[k]={textContent:'LIVE',style:{}})});
 const S={golfers:[{name:'Not Submitted',band:'A',hcp:'5',self_ranked:false,team:null},{name:'Range Only',band:'C',hcp:'',self_ranked:true,team:null},{name:'Exact',band:'B',hcp:'12',self_ranked:true,team:null}],teams:[{name:'One',captain:'',roster:[0]},{name:'Two',captain:'',roster:[]}],picks:[],timerPaused:true};
 const ctx={S,savingDraft:false,document:{getElementById:id=>elements[id],querySelectorAll:()=>[]},checkDraftSound(){},order:()=>0,totalPicks:()=>3,myTeam:0,pickInFlight:false,pickSyncFailed:false,captainRoleRefreshPending:false,captainUserId:'user',captainSessionForegroundOnline:()=>true,canBand:()=>true,esc:String,bands:['A','B','C','D'],tbc:()=>0,bandRange:b=>({A:'0–9',B:'10–17',C:'18–25',D:'26+'}[b]||'—'),teamCapacity:()=>1,draw(){},drawClock(){}};
 vm.runInNewContext(fn+';'+name+'()',ctx);
 const pool=(file==='draft.html'?elements.publicPool:elements.pool).innerHTML;
 assert.doesNotMatch(pool,/Not Submitted<\/strong>[\s\S]*?<span class="badge">A<\/span>/);
 assert.match(pool,/Not Submitted<\/strong>[\s\S]*?Unranked/);
 assert.match(pool,/Range Only<\/strong>[\s\S]*?<span class="badge">C<\/span>/);
 assert.doesNotMatch(elements.teams.innerHTML,/<span class="badge">A<\/span>/);
 assert.match(elements.teams.innerHTML,/Unranked/);
 assert.equal(S.golfers[0].band,'A','Rendering must not modify saved data');
});
test('commissioner setup hides an unsubmitted stored band without changing the profile',()=>{
 const source=fs.readFileSync('admin.html','utf8'),start=source.indexOf('function setupRender(){'),end=source.indexOf('\nfunction liveRender()',start),fn=source.slice(start,end);
 const elements=new Proxy({}, {get:(o,k)=>o[k]||(o[k]={textContent:'',querySelectorAll:()=>[]})});
 const S={golfers:[{name:'Not Submitted',band:'A',hcp:'5',self_ranked:false}],teams:[],picks:[],draftType:'snake',timerLength:60};
 vm.runInNewContext(fn+';setupRender()',{S,document:{getElementById:id=>elements[id]},esc:String,bands:['A','B','C','D'],updateDraftSetupPreview(){},rsvpPreviewEnabled:false,setupIsLocked:()=>false});
 assert.match(elements.grows.innerHTML,/<option value="" selected>Unranked/);
 assert.doesNotMatch(elements.grows.innerHTML,/<option selected>A/);
 assert.match(elements.grows.innerHTML,/data-h="0"[^>]*value=""/);
 assert.equal(S.golfers[0].band,'A');
});

test('captain screen disables weighted-ineligible picks and keeps the server RPC authoritative',()=>{
 const captain=fs.readFileSync('captain.html','utf8');
 const common=fs.readFileSync('common.js','utf8');
 assert.match(captain,/<script src="weighted-draft\.js"><\/script>/);
 assert.match(captain,/db\.rpc\("elleng_make_pick"/);
 const start=common.indexOf('function canBand(t,b){'),end=common.indexOf('\nlet latestLoadRequest',start);
 assert.ok(start>=0&&end>start,'shared canBand integration exists');
 const api=require('../weighted-draft.js');
 const S={teams:[{captain:'Jarad',captainGolferIndex:0,roster:[0]},{captain:'Carl',captainGolferIndex:1,roster:[1]}],golfers:[...'ABBBCC'].map((band,i)=>({name:i===0?'Jarad':i===1?'Carl':'Golfer '+i,band,self_ranked:true,team:i<2?i:null})),picks:[{golfer:0,team:0},{golfer:1,team:1}],draftType:'snake',draftRules:'weighted',balanceVersion:1,timerPaused:false};
 const ctx={S,globalThis:{EllenGWeightedDraft:api}};
 vm.runInNewContext(common.slice(start,end),ctx);
 assert.equal(ctx.canBand(1,'B'),false,'Carl cannot select a second B before Jarad gets one');
 assert.equal(ctx.canBand(1,'C'),true,'Carl may select an eligible C');
 S.balanceVersion=2;
 assert.equal(ctx.canBand(1,'C'),false,'unknown balance versions fail closed');
});
