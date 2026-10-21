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
function adminAccess({user={id:'owner'},data={owner_id:'owner',state:{}},error=null}={}){
 const html=fs.readFileSync(path.join(__dirname,'../../admin.html'),'utf8');
 const start=html.indexOf('async function openAdmin(){'),end=html.indexOf('document.getElementById("login").onclick',start);
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{display:id==='adminApp'?'none':'block'},textContent:''});return nodes.get(id)};
 let rendered=0;
 const query={select(){return this},eq(){return this},maybeSingle:async()=>({data,error})};
 const context={db:{auth:{getUser:async()=>({data:{user}})},from:()=>query},cfg:{draftId:'test'},document:{getElementById:node},alert(){},fresh:()=>({}),S:{},setupRender(){rendered++},subscribe(){},tick:1};
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
