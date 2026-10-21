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
