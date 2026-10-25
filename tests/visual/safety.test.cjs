const test=require('node:test'),assert=require('node:assert/strict');
const {WIDTHS,previewURL}=require('./run.cjs');
test('visual matrix has every requested exact width',()=>assert.deepEqual(WIDTHS,[320,375,390,430,1024,1440,1920]));
test('live visual checks reject production, unknown hosts and credential URLs',()=>{
 for(const url of ['https://elleng-cup.vercel.app','https://example.com','http://elleng-i6xsd5b3j-blaineg04-3428.vercel.app','https://u:p@elleng-i6xsd5b3j-blaineg04-3428.vercel.app','https://elleng-i6xsd5b3j-blaineg04-3428.vercel.app/?secret=x'])assert.throws(()=>previewURL(url));
 assert.equal(previewURL('https://elleng-i6xsd5b3j-blaineg04-3428.vercel.app'),'https://elleng-i6xsd5b3j-blaineg04-3428.vercel.app');
});
test('preview guard permits read-only profile requests and blocks profile/account mutations',()=>{
 const {previewRequestAllowed}=require('./run.cjs');
 const req=(endpoint,body)=>({method:()=> 'POST',url:()=>`https://xepccqedhbucpbwuykoc.supabase.co/functions/v1/${endpoint}`,postDataJSON:()=>body});
 assert.equal(previewRequestAllowed(req('player-profile',{draft_id:'elleng-cup'})),true);
 for(const action of ['update_photo','commissioner_update_photo','password_changed'])assert.equal(previewRequestAllowed(req('player-profile',{draft_id:'elleng-cup',action})),false);
 assert.equal(previewRequestAllowed(req('player-admin',{draft_id:'elleng-cup',action:'list'})),true);
 assert.equal(previewRequestAllowed(req('player-admin',{draft_id:'elleng-cup',action:'create_or_update'})),false);
 assert.equal(previewRequestAllowed(req('player-profile',{draft_id:'elleng-cup',photo_url:'x'})),false);
});
test('preview guard permits password authentication only in the local session helper',()=>{
 const {previewRequestAllowed}=require('./run.cjs');
 const req={method:()=> 'POST',url:()=> 'https://xepccqedhbucpbwuykoc.supabase.co/auth/v1/token?grant_type=password'};
 assert.equal(previewRequestAllowed(req),false);
 assert.equal(previewRequestAllowed(req,true),true);
});

// Run the actual page access function against controlled auth/query responses.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function adminAccess({user={id:'owner'},data={owner_id:'owner',state:{}},error=null,authError=null,rejectLookup=false}={}){
 const html=fs.readFileSync(path.join(__dirname,'../../admin.html'),'utf8');
 const start=html.indexOf('async function openAdmin(){'),end=html.indexOf('document.getElementById("login").onclick',start);
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{display:id==='adminApp'?'none':'block'},textContent:''});return nodes.get(id)};
 let rendered=0;
 const query={select(){return this},eq(){return this},maybeSingle:async()=>{if(rejectLookup)throw new Error("Network request rejected");return {data,error}}};
 const context={db:{auth:{getUser:async()=>({data:{user},error:authError})},from:()=>query},cfg:{draftId:'test'},document:{getElementById:node},alert(){},fresh:()=>({}),S:{},setupRender(){rendered++},subscribe(){},tick:1};
 vm.runInNewContext(html.slice(start,end),context);
 return {run:()=>context.openAdmin(),node,rendered:()=>rendered};
}
test('commissioner controls remain hidden for a different draft owner',async()=>{
 const page=adminAccess({data:{owner_id:'someone-else',state:{}}});await page.run();
 assert.equal(page.node('adminApp').style.display,'none');assert.equal(page.rendered(),0);
 assert.match(page.node('authMsg').textContent,/commissioner|owned|access/i);
});
test('commissioner controls remain hidden when the draft lookup fails',async()=>{
 const page=adminAccess({data:null,error:{message:'Connection unavailable'}});
 await page.run().catch(()=>{});
 assert.equal(page.node('adminApp').style.display,'none');assert.equal(page.rendered(),0);
});
test('commissioner access allows the matching owner and keeps signed-out controls hidden',async()=>{
 const owner=adminAccess();await owner.run();assert.equal(owner.node('adminApp').style.display,'block');assert.equal(owner.rendered(),1);
 const signedOut=adminAccess({user:null});await signedOut.run();assert.equal(signedOut.node('adminApp').style.display,'none');assert.equal(signedOut.rendered(),0);
});
function captainAccess(data){
 const html=fs.readFileSync(path.join(__dirname,'../../captain.html'),'utf8');
 const start=html.indexOf('async function whoami(){'),end=html.indexOf('let draftSoundEnabled',start);
 const message={textContent:''};
 const query={select(){return this},eq(){return this},single:async()=>({data,error:null})};
 const context={db:{auth:{getUser:async()=>({data:{user:{id:'player'}}})},from:()=>query},cfg:{draftId:'test'},document:{getElementById:()=>message},myTeam:null};
 vm.runInNewContext(html.slice(start,end),context);return {run:()=>context.whoami(),message};
}
test('missing or malformed captain assignments show guidance without opening draft controls',async()=>{
 for(const data of [null,{}, {team_index:null},{team_index:-1},{team_index:'invalid'},{team_index:true}]){
  const page=captainAccess(data);assert.equal(await page.run(),false);assert.match(page.message.textContent,/assign|commissioner/i);
 }
});
test('captain assignment for team zero is accepted',async()=>assert.equal(await captainAccess({team_index:0}).run(),true));

test('signed-out commissioner page reports sign-in instead of connecting',async()=>{
 const page=adminAccess({user:null});await page.run();assert.equal(page.node('connection').textContent,'SIGN IN');
});
test('wrong commissioner account reports no access instead of connecting',async()=>{
 const page=adminAccess({data:{owner_id:'another-owner',state:{}}});await page.run();assert.equal(page.node('connection').textContent,'NO ACCESS');
});
test('commissioner lookup failures show recovery guidance without leaving controls visible',async()=>{
 for(const options of [{data:null,error:{message:'Query unavailable'}},{rejectLookup:true},{user:null,authError:{message:'Authentication service unavailable'}}]){
  const page=adminAccess(options);await page.run();
  assert.equal(page.node('connection').textContent,'UNAVAILABLE');assert.match(page.node('authMsg').textContent,/try again/i);
  assert.equal(page.node('adminApp').style.display,'none');assert.equal(page.rendered(),0);
 }
});

function signInPage(kind,{email='visual@example.invalid',password='test-only-password',authenticate=async()=>({error:null})}={}){
 const html=fs.readFileSync(path.join(__dirname,kind==='admin'?'../../admin.html':'../../captain.html'),'utf8');
 const buttonId=kind==='admin'?'login':'signin',passwordId=kind==='admin'?'password':'pw',messageId=kind==='admin'?'authMsg':'msg';
 const start=html.indexOf(`document.getElementById("${buttonId}").onclick=`),end=html.indexOf(kind==='admin'?'(async()=>':'document.getElementById("soundToggle").onclick',start);
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='email'?email:id===passwordId?password:'',textContent:id===buttonId?'Sign In':'',disabled:false,style:{}});return nodes.get(id)};
 let requests=0,opened=0;
 const context={document:{getElementById:node},db:{auth:{signInWithPassword:async args=>{requests++;return authenticate(args)}}},openAdmin:async()=>{opened++},whoami:async()=>true,load:async()=>{},render(){opened++},subscribe(){},setInterval(){},draw(){},console:{error(){}}};
 vm.runInNewContext(html.slice(start,end),context);
 return {click:()=>node(buttonId).onclick(),button:()=>node(buttonId),password:()=>node(passwordId),message:()=>node(messageId),requests:()=>requests,opened:()=>opened};
}
test('draft sign-in validates empty credentials before sending a request',async()=>{
 for(const kind of ['admin','captain'])for(const credentials of [{email:'',password:'x'},{email:'x@example.invalid',password:''}]){
  const page=signInPage(kind,credentials);await page.click();assert.equal(page.requests(),0,kind);assert.match(page.message().textContent,/email.*password|password.*email/i);
 }
});
test('draft sign-in catches rejected requests and restores the button',async()=>{
 for(const kind of ['admin','captain']){
  const page=signInPage(kind,{authenticate:async()=>{throw new Error('Network unavailable')}});
  await page.click();assert.equal(page.button().disabled,false,kind);assert.equal(page.button().textContent,'Sign In');assert.match(page.message().textContent,/unavailable|try again/i);assert.equal(page.opened(),0);
 }
});
test('draft sign-in sends only one request while a submission is pending',async()=>{
 for(const kind of ['admin','captain']){
  let resolve;const pending=new Promise(r=>{resolve=r});const page=signInPage(kind,{authenticate:()=>pending});
  const first=page.click(),second=page.click();
  try{assert.equal(page.requests(),1,kind);assert.equal(page.button().disabled,true);}
  finally{resolve({error:{message:'Invalid login credentials'}});await Promise.all([first,second]);}
  assert.equal(page.button().disabled,false);assert.match(page.message().textContent,/Invalid login/);assert.equal(page.opened(),0);
 }
});
test('successful draft authentication clears the password and restores the button',async()=>{
 for(const kind of ['admin','captain']){
  const page=signInPage(kind);await page.click();assert.equal(page.opened(),1,kind);assert.equal(page.password().value,'');assert.equal(page.button().disabled,false);assert.equal(page.button().textContent,'Sign In');
 }
});

function signOutPage(authenticate){
 const html=fs.readFileSync(path.join(__dirname,'../../scoring.html'),'utf8');
 const start=html.indexOf('async function signOutFromHub(){'),end=html.indexOf('function openHubView(',start);
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'Sign Out',classList:{add(){}}});return nodes.get(id)};
 let requests=0,viewer=0,cleared=0;
 const context={user:{id:'signed-in'},captainTeam:0,isCommissioner:true,currentGolferIndex:0,currentUsername:'visual',mustChangePassword:false,
  $:node,db:{auth:{signOut:async()=>{requests++;return authenticate()}}},sessionStorage:{removeItem(){cleared++}},document:{body:{classList:{add(){}}}},setMobileNavVisible(){},enterViewer:async()=>{viewer++},console:{warn(){}}};
 vm.runInNewContext(html.slice(start,end),context);
 return {run:()=>context.signOutFromHub(),context,node,requests:()=>requests,viewer:()=>viewer,cleared:()=>cleared};
}
test('failed sign-out keeps the signed-in screen and offers retry guidance',async()=>{
 for(const authenticate of [async()=>({error:{message:'Server unavailable'}}),async()=>{throw new Error('Network unavailable')}]){
  const page=signOutPage(authenticate);await page.run();assert.equal(page.context.user.id,'signed-in');assert.equal(page.viewer(),0);assert.equal(page.cleared(),0);
  assert.match(page.node('hubSignedInAs').textContent,/sign out.*try again/i);assert.match(page.node('userLabel').textContent,/sign out.*try again/i);assert.equal(page.node('hubSignOutBtn').disabled,false);
 }
});
test('successful sign-out clears local app identity after the auth request succeeds',async()=>{
 const page=signOutPage(async()=>({error:null}));await page.run();assert.equal(page.context.user,null);assert.equal(page.context.isCommissioner,false);assert.equal(page.context.captainTeam,null);assert.equal(page.viewer(),1);assert.equal(page.cleared(),1);
});
test('sign-out ignores another click while the auth request is pending',async()=>{
 let resolve;const pending=new Promise(r=>{resolve=r});const page=signOutPage(()=>pending);
 const first=page.run(),second=page.run();
 try{assert.equal(page.requests(),1);assert.equal(page.node('hubSignOutBtn').disabled,true);assert.equal(page.node('logoutBtn').disabled,true);}
 finally{resolve({error:null});await Promise.all([first,second]);}
 assert.equal(page.node('hubSignOutBtn').disabled,false);assert.equal(page.node('logoutBtn').disabled,false);assert.equal(page.viewer(),1);
});

function mainSignIn({email='visual@example.invalid',password='test-only-password',authenticate=async()=>({data:{user:{id:'visual-user'}},error:null})}={}){
 const html=fs.readFileSync(path.join(__dirname,'../../scoring.html'),'utf8');
 const start=html.indexOf('$("loginBtn").addEventListener("click",async()=>{'),end=html.indexOf('$("changeAccountPasswordBtn").addEventListener',start);
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='email'?email:id==='password'?password:'',disabled:false,textContent:id==='loginBtn'?'Sign In':'',addEventListener(event,fn){this.onclick=fn}});return nodes.get(id)};
 let requests=0,opened=0;const context={$:node,user:null,db:{auth:{signInWithPassword:async args=>{requests++;return authenticate(args)}}},usernameToAuthEmail:name=>name+'@example.invalid',enterApp:async()=>{opened++},console:{error(){}}};
 vm.runInNewContext(html.slice(start,end),context);return {run:()=>node('loginBtn').onclick(),node,context,requests:()=>requests,opened:()=>opened};
}
test('main sign-in clears the password after authenticated success',async()=>{
 const page=mainSignIn();await page.run();assert.equal(page.opened(),1);assert.equal(page.node('password').value,'');assert.equal(page.node('loginBtn').disabled,false);
});
test('main sign-in does not submit blank credentials or duplicate a pending request',async()=>{
 const empty=mainSignIn({email:''});await empty.run();assert.equal(empty.requests(),0);
 let resolve;const pending=new Promise(r=>{resolve=r});const page=mainSignIn({authenticate:()=>pending});const first=page.run(),second=page.run();
 try{assert.equal(page.requests(),1);assert.equal(page.node('loginBtn').disabled,true);}
 finally{resolve({data:{user:{id:'visual-user'}},error:null});await Promise.all([first,second]);}
 assert.equal(page.opened(),1);assert.equal(page.node('loginBtn').disabled,false);
});
test('main sign-in recovers from a rejected request without entering the app',async()=>{
 const page=mainSignIn({authenticate:async()=>{throw new Error('Network unavailable')}});await page.run();assert.equal(page.opened(),0);assert.equal(page.context.user,null);assert.equal(page.node('loginBtn').disabled,false);assert.match(page.node('loginMsg').textContent,/unavailable/i);
});
test('main sign-in rejects an auth response that contains no user',async()=>{
 const page=mainSignIn({authenticate:async()=>({data:{user:null},error:null})});await page.run();assert.equal(page.opened(),0);assert.equal(page.context.user,null);assert.match(page.node('loginMsg').textContent,/no user session/i);assert.equal(page.node('loginBtn').disabled,false);
});

function selfSavePage(kind,response,{refreshError=null}={}){
 const html=fs.readFileSync(path.join(__dirname,'../../scoring.html'),'utf8');
 const name=kind==='score'?'saveSelfScore':'saveSelfHandicap';
 const start=html.indexOf(`async function ${name}(`),end=html.indexOf(kind==='score'?'async function resetGolferPin(':'async function saveSelfScore(',start);
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='selfScoreHole'?'1':id==='selfScoreInput'?'4':id==='selfBandSelect'?'A':id==='selfHandicapInput'?'8':'4',textContent:'',disabled:false});return nodes.get(id)};
 const queued=[];const statuses=[];const context={queueOfflineScore:item=>queued.push(item),$:node,currentGolferIndex:0,scoreSaveBusy:false,DRAFT_ID:'draft',TOURNAMENT_ID:'tournament',navigator:{onLine:true},db:{functions:{invoke:async()=>response}},setSyncStatus:(status)=>statuses.push(status),bandFromHandicapValue:()=> 'A',loadBase:async()=>{if(refreshError)throw refreshError},loadScores:async()=>{},renderAll(){},draftState:{teams:[{name:'Test team'}]},golfRelativeLabel:()=> 'E',golfScoreTerm:()=> 'Par',parForHole:()=>4};
 vm.runInNewContext(html.slice(start,end),context);
 return {run:()=>context[name](),statuses,node,context,queued};
}
test('rejected personal score and handicap saves keep the error sync status',async()=>{
 for(const kind of ['score','handicap']){
  const page=selfSavePage(kind,{data:null,error:{message:'Permission denied'}});await page.run();
  assert.equal(page.statuses.at(-1),'error',kind);assert.match(page.node(kind==='score'?'selfScoreMsg':'selfHandicapMsg').textContent,/Permission denied/);
  assert.equal(page.node(kind==='score'?'saveSelfScore':'saveSelfHandicap').disabled,false);
 }
});
test('successful personal score and handicap saves finish with saved status',async()=>{
 for(const kind of ['score','handicap']){
  const page=selfSavePage(kind,{data:{mode:'team',team_index:0,band:'A',golfer_name:'Test golfer',handicap:'8'},error:null});await page.run();assert.equal(page.statuses.at(-1),'saved',kind);
 }
});

 test('accepted personal scores are never queued again when the following refresh fails',async()=>{
 const page=selfSavePage('score',{data:{mode:'team',team_index:0},error:null},{refreshError:new Error('Network request failed')});await page.run();
 assert.equal(page.queued.length,0);assert.match(page.node('selfScoreMsg').textContent,/saved.*refresh/i);assert.equal(page.statuses.at(-1),'error');assert.equal(page.context.scoreSaveBusy,false);
 });
 test('unacknowledged network score failures remain queued for retry',async()=>{
 const page=selfSavePage('score',{data:null,error:{message:'Network request failed'}});await page.run();assert.equal(page.queued.length,1);assert.match(page.node('selfScoreMsg').textContent,/offline/);
 });

test('commissioner saves use version checked RPC and reject a stale write',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../admin.html'),'utf8');
 const start=html.indexOf('let draftUpdatedAt=null;');
 const end=html.indexOf('let liveMode=false',start);
 assert.ok(start>=0&&end>start,'Commissioner versioned save functions missing');
 let calls=0;
 const captured=[];
 const ctx=vm.createContext({
  cfg:{draftId:'test-draft'},
  S:{picks:[{golfer:1,team:0}]},
  fresh:()=>({}),
  alert:()=>{},
  db:{auth:{getUser:async()=>({data:{user:{id:'commissioner'}},error:null})},
   rpc:async(name,args)=>{calls++;captured.push({name,args});return {data:null,error:{message:'Concurrent draft update'}}}}
 });
 vm.runInContext(html.slice(start,end),ctx);
 vm.runInContext("draftUpdatedAt='2026-10-22T10:00:00.000Z'",ctx);
 await assert.rejects(vm.runInContext('secureSave()',ctx),error=>error?.message==='Concurrent draft update');
 assert.equal(calls,1);
 assert.equal(captured[0].name,'elleng_save_state_if_fresh');
 assert.equal(captured[0].args.p_expected_updated_at,'2026-10-22T10:00:00.000Z');
 assert.equal(ctx.S.picks.length,1);
 assert.equal(vm.runInContext('savingDraft',ctx),false);
});

test('commissioner refuses overlapping saves until the first finishes',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../admin.html'),'utf8');
 const start=html.indexOf('let draftUpdatedAt=null;');
 const end=html.indexOf('let liveMode=false',start);
 let release,called=0;
 const pending=new Promise(resolve=>{release=resolve});
 const ctx=vm.createContext({
  cfg:{draftId:'test-draft'},
  S:{picks:[]},fresh:()=>({}),alert:()=>{},
  db:{auth:{getUser:async()=>({data:{user:{id:'commissioner'}},error:null})},
   rpc:async()=>{called++;return pending}}
 });
 vm.runInContext(html.slice(start,end),ctx);
 vm.runInContext("draftUpdatedAt='2026-10-22T10:00:00.000Z'",ctx);
 const first=vm.runInContext('secureSave()',ctx);
 await assert.rejects(vm.runInContext('secureSave()',ctx),/already in progress/);
 release({data:{updated_at:'2026-10-22T10:00:01.000Z'},error:null});
 await first;
 assert.equal(called,1);
 assert.equal(vm.runInContext('savingDraft',ctx),false);
 assert.equal(vm.runInContext('draftUpdatedAt',ctx),'2026-10-22T10:00:01.000Z');
});

test('commissioner ignores an older realtime snapshot after a confirmed draft save',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../admin.html'),'utf8');
 const start=html.indexOf('let draftUpdatedAt=null;');
 const end=html.indexOf('let liveMode=false',start);
 assert.ok(start>=0&&end>start,'Commissioner synchronization functions missing');
 const ctx=vm.createContext({
  cfg:{draftId:'test-draft'},
  S:{picks:[{golfer:1,team:0}]},
  fresh:()=>({}),
  db:{from:()=>({select(){return this},eq(){return this},single:async()=>({data:{updated_at:'2026-10-22T10:00:00Z',state:{picks:[]}},error:null})})}
 });
 vm.runInContext(html.slice(start,end),ctx);
 vm.runInContext("draftUpdatedAt='2026-10-22T10:00:01Z'",ctx);
 await vm.runInContext('load()',ctx);
 assert.equal(ctx.S.picks.length,1,'Stale refresh must not erase confirmed pick');
 assert.equal(vm.runInContext('draftUpdatedAt',ctx),'2026-10-22T10:00:01Z');
});

test('captain submits at most one pick while the server response is pending',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../captain.html'),'utf8');
 const start=html.indexOf('let captainPickSaving=false;');
 const end=html.indexOf('document.getElementById("signin").onclick',start);
 assert.ok(start>=0&&end>start,'Captain pick handler missing');
 let resolvePick,requests=0,renders=0;
 const pending=new Promise(resolve=>{resolvePick=resolve});
 const buttons=[{disabled:false},{disabled:false}];
 const ctx=vm.createContext({
  S:{timerPaused:false,golfers:[{name:'Sample golfer'}],teams:[{name:'Team 1'}]},
  myTeam:0,cfg:{draftId:'test-draft'},draftSoundEnabled:false,lastSoundPickCount:null,
  db:{rpc:async()=>{requests++;return pending}},
  document:{querySelectorAll:()=>buttons},
  confirm:()=>true,alert:()=>{},fresh:()=>({}),render:()=>{renders++},
  load:async()=>{},console
 });
 vm.runInContext(html.slice(start,end),ctx);
 const first=vm.runInContext('pick(0)',ctx);
 await vm.runInContext('pick(0)',ctx);
 assert.equal(requests,1);
 assert.ok(buttons.every(button=>button.disabled));
 resolvePick({data:{picks:[{golfer:0,team:0}]},error:null});
 await first;
 assert.equal(vm.runInContext('captainPickSaving',ctx),false);
 assert.equal(renders,1);
 assert.equal(ctx.S.picks.length,1);
});

test('18-hole shamble awards cumulative points from every golfer, with Gator doubling',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../scoring.html'),'utf8');
 const start=html.indexOf('function individualCupPoints(');
 const end=html.indexOf('function finalCargoBonus()',start);
 assert.ok(start>=0&&end>start,'Cumulative shamble scoring functions missing');
 const ctx=vm.createContext({
  teams:[{name:'Team 1'},{name:'Team 2'}],
  draftState:{teams:[{roster:[0,1]},{roster:[2,3]}],golfers:[{name:'A'},{name:'B'},{name:'C'},{name:'D'}]},
  playerScores:[],tournament:{gator_hole:null},
  scores:[],parForHole:()=>4,isSplitPair:()=>false,
  teamRosterGolfers:i=>i===0?[{index:0},{index:1}]:[{index:2},{index:3}]
 });
 vm.runInContext(html.slice(start,end),ctx);
 const pts=(st,par)=>vm.runInContext('individualCupPoints('+JSON.stringify(st)+','+par+')',ctx);
 for(const [st,score] of [[2,5],[3,4],[4,3],[5,2],[6,1],[7,0]])assert.equal(pts(st,4),score);
 assert.equal(pts('',4),null);
 ctx.playerScores=[
  {team_index:0,golfer_index:0,hole:1,score:3},
  {team_index:0,golfer_index:1,hole:1,score:4},
  {team_index:1,golfer_index:2,hole:1,score:5},
  {team_index:1,golfer_index:3,hole:1,score:6}
 ];
 assert.deepEqual(Array.from(vm.runInContext('pointsForHole(1)',ctx)),[7,3]);
 ctx.tournament.gator_hole=1;
 assert.deepEqual(Array.from(vm.runInContext('pointsForHole(1)',ctx)),[14,6]);
 ctx.playerScores.pop();
 assert.equal(vm.runInContext('pointsForHole(1)[1]',ctx),null,'Incomplete roster has no official team total');
});

test('staged golfer endpoint writes individual shamble scores on holes 1 through 18 only',()=>{
 const endpoint=fs.readFileSync(path.join(__dirname,'../../supabase/functions/golfer-handicap/index.ts'),'utf8');
 const action=endpoint.slice(endpoint.indexOf('if(action==="update_score")'));
 const shamble=action.slice(action.indexOf('// For the 18-hole shamble'));
 assert.match(action,/hole<1\|\|hole>18/,'Reject out-of-range holes');
 assert.match(action,/ownGolfer\(draft\)/,'Require authenticated linked golfer');
 assert.match(action,/roster\.includes\(golferIndex\)/,'Enforce team roster identity');
 assert.match(shamble,/elleng_player_hole_scores/,'Save individual score rows');
 assert.match(shamble,/golfer_index:golferIndex/,'Preserve unique golfer scores');
 assert.doesNotMatch(shamble,/service\.from\("elleng_team_scores"\)/,'Never derive lowest-ball team rows for shamble');
 assert.doesNotMatch(shamble,/if\(hole<=9\)/,'All 18 holes use individual shamble scoring');
});

test('front nine shamble scoring has a staged database constraint migration',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261024_elleng_18_hole_individual_scores.sql'),'utf8');
 assert.match(sql,/ALTER TABLE public\.elleng_player_hole_scores/);
 assert.match(sql,/DROP CONSTRAINT IF EXISTS elleng_player_hole_scores_hole_check/);
 assert.match(sql,/CHECK \(hole BETWEEN 1 AND 18\)/);
 assert.doesNotMatch(sql,/TRUNCATE|DELETE FROM|DROP TABLE/i,'Migration must preserve existing scoring records');
});

test('staged golfer score endpoint requires a real authenticated player-account link',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../../supabase/functions/golfer-handicap/index.ts'),'utf8');
 const start=src.indexOf('async function ownGolfer('),end=src.indexOf('async function requireCommissioner(',start);
 assert.ok(start>=0&&end>start,'Missing golfer identity authorization');
 const fn=src.slice(start,end);
 assert.match(fn,/elleng_player_accounts/,'Look up a real user-to-golfer account link');
 assert.match(fn,/if\(!link\)/,'Reject users without a linked golfer');
 assert.doesNotMatch(fn,/isBguyTest|bguy@players\.ellengcup\.app|golfer_index:0/,'No hardcoded test-account bypass');
});

test('staged scoring endpoint fails closed for invalid tournament states',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../supabase/functions/golfer-handicap/index.ts'),'utf8');
 const start=source.indexOf('async function activeTournament(');
 const end=source.indexOf('if(action==="reset_pin"',start);
 assert.ok(start>=0&&end>start,'Missing active tournament guard');
 const guard=source.slice(start,end);
 assert.match(guard,/\["setup","live"\]\.includes\(String\(data\.status\|\|""\)\)/,
   'Only explicit setup and live tournament states may accept scoring');
 assert.doesNotMatch(guard,/\["complete","archived"\]\.includes/,
   'A denylist would allow unknown or malformed tournament states');
});

test('golfer scoring rejects tournament IDs unrelated to the authenticated draft',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../supabase/functions/golfer-handicap/index.ts'),'utf8');
 const start=source.indexOf('async function activeTournament('),end=source.indexOf('if(action==="reset_pin"',start);
 assert.ok(start>=0&&end>start,'Missing tournament authorization guard');
 const guard=source.slice(start,end);
 assert.match(guard,/select\("team_count,status,draft_id"\)/,'Must load tournament draft binding');
 assert.match(guard,/String\(data\.draft_id\|\|""\)!==draftId/,'Must reject cross-draft tournament writes');
});

test('staged golfer scoring rejects malformed hole selectors before persistence',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../supabase/functions/golfer-handicap/index.ts'),'utf8');
 const start=source.indexOf('if(action==="update_score")'),end=source.indexOf('const draft=await getDraft()',start);
 assert.ok(start>=0&&end>start,'Missing score input validation');
 const validation=source.slice(start,end);
 assert.match(validation,/typeof holeRaw==="boolean"/);
 assert.match(validation,/holeRaw===null\|\|holeRaw===undefined/);
 assert.match(validation,/typeof holeRaw==="object"/);
 assert.match(validation,/String\(holeRaw\)\.trim\(\)===""/);
 assert.match(validation,/!Number\.isInteger\(hole\)\|\|hole<1\|\|hole>18/);
});

test('personal score save requires explicit successful function acknowledgement',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../scoring.html'),'utf8');
 const start=html.indexOf('async function saveSelfScore('),end=html.indexOf('function ',start+25);
 assert.ok(start>=0,'Missing personal score save handler');
 const handler=html.slice(start,end>start?end:start+2700);
 assert.match(handler,/data\?\.ok!==true/,'Missing success response must not be shown as saved');
 assert.match(handler,/player_shamble/,'Only valid scoring response modes are accepted');
 assert.match(handler,/scoreAccepted=true/,'Success is acknowledged only after validating response');
 assert.ok(handler.indexOf('data?.ok!==true')<handler.indexOf('scoreAccepted=true'));
});
