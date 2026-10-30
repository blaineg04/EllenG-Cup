const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('supabase/functions/golfer-handicap/index.ts','utf8');
function handler({signedIn=true,rpcError=null}={}){
 let handle;const calls=[];
 const user={id:'11111111-1111-4111-8111-111111111111'};
 const client={auth:{getUser:async()=>({data:{user:signedIn?user:null},error:null})},rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true,mode:'split_pair',score:18,team_score:37},error:rpcError}},from(){throw Error('Score request must not issue separate table writes')}};
 const ctx={Request,Response,Error,console:{error(){}},createClient:(_url,_key,options)=>options?.global?client:{from(){throw Error('Service-role score access prohibited')},rpc(){throw Error('RPC must carry the caller JWT')}},Deno:{env:{get:()=> 'synthetic'},serve:fn=>handle=fn}};
 vm.runInNewContext(stripTypeScriptTypes(source.replace(/^import .*;\n/,'')),ctx);
 return {calls,run:body=>handle(new Request('https://synthetic.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify(body)}))};
}
test('player save uses one caller-authenticated atomic RPC without separate table operations',async()=>{
 const h=handler();const response=await h.run({action:'update_score',draft_id:'test-draft',tournament_id:'test-event',hole:1,score:18});
 assert.equal(response.status,200);assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,'elleng_save_own_score_atomic');
 assert.equal(h.calls[0].args.p_hole,1);assert.equal(h.calls[0].args.p_score,18);assert.equal((await response.json()).team_score,37);
 assert(!('p_user_id' in h.calls[0].args),'Caller identity must come from JWT');
});
test('player clear is one atomic RPC with a NULL score',async()=>{
 const h=handler();const response=await h.run({action:'update_score',draft_id:'test-draft',tournament_id:'test-event',hole:10,score:null});
 assert.equal(response.status,200);assert.equal(h.calls.length,1);assert.equal(h.calls[0].args.p_score,null);
});
test('invalid player score and unauthenticated request never reach RPC',async()=>{
 for(const body of [{hole:0,score:4},{hole:1,score:21},{hole:true,score:4}]){const h=handler();assert.equal((await h.run({action:'update_score',...body})).status,400);assert.equal(h.calls.length,0)}
 const h=handler({signedIn:false});assert.equal((await h.run({action:'update_score',hole:1,score:4})).status,401);assert.equal(h.calls.length,0);
});
test('RPC failure cannot return player-save success',async()=>{
 const h=handler({rpcError:new Error('synthetic transaction failure')});const r=await h.run({action:'update_score',hole:1,score:4});assert.equal(r.status,500);assert.equal(h.calls.length,1);assert.match((await r.json()).error,/transaction failure/);
});
