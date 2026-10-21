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
