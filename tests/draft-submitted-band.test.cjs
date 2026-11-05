const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
for(const file of ['draft.html','captain.html','admin.html'])test(file+' shows only submitted bands, including range-only submissions',()=>{
 const source=fs.readFileSync(file,'utf8'),name=file==='admin.html'?'liveRender':'render',start=source.indexOf('function '+name+'(){'),end=source.indexOf('\nfunction ',start+20),fn=source.slice(start,end);
 const elements=new Proxy({}, {get:(o,k)=>o[k]||(o[k]={textContent:'LIVE',style:{}})});
 const S={golfers:[{name:'Not Submitted',band:'A',hcp:'5',self_ranked:false,team:null},{name:'Range Only',band:'C',hcp:'',self_ranked:true,team:null},{name:'Exact',band:'B',hcp:'12',self_ranked:true,team:null}],teams:[{name:'One',captain:'',roster:[0]},{name:'Two',captain:'',roster:[]}],picks:[],timerPaused:true};
 const ctx={S,document:{getElementById:id=>elements[id],querySelectorAll:()=>[]},checkDraftSound(){},order:()=>0,totalPicks:()=>3,myTeam:0,pickInFlight:false,pickSyncFailed:false,captainRoleRefreshPending:false,captainUserId:'user',captainSessionForegroundOnline:()=>true,canBand:()=>true,esc:String,bands:['A','B','C','D'],tbc:()=>0,bandRange:b=>({A:'0–9',B:'10–17',C:'18–25',D:'26+'}[b]||'—'),teamCapacity:()=>1,draw(){},drawClock(){}};
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
