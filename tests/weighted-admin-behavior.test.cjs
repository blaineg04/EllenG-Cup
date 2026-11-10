const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),api=require('../weighted-draft.js');
const source=fs.readFileSync('admin.html','utf8');
function harness(){
 const s={teams:[{captain:'Aaron',roster:[]},{captain:'Carl',roster:[]}],golfers:[...'ABBBCC'].map((band,i)=>({name:i===0?'Aaron':i===1?'Carl':'Golfer '+i,band,self_ranked:true,team:null})),picks:[],draftType:'snake',timerPaused:true,timerLength:60};
 let server=structuredClone(s),reads=0,rpcError=null;const elements={prepareWeighted:{},setup:{style:{}},live:{style:{}}};
 const ctx={S:s,savingDraft:false,commissionerUserId:'owner',commissionerAuthEpoch:1,commissionerLoadRequest:0,draftUpdatedAt:'2026-01-01',cfg:{draftId:'qa'},EllenGWeightedDraft:api,structuredClone,Date,liveMode:false,console,alert:message=>{throw Error(message)},rsvpPreviewController:{invalidate(){}},fresh:()=>({}),liveRender(){},revokeCommissionerSession(){},totalPicks:()=>6,order:()=>1,canBand:()=>true,saveCommissionerAction:fn=>fn(),remaining:()=>30,
 document:{visibilityState:'visible',getElementById:id=>elements[id]},
 db:{rpc:async(name,args)=>{if(rpcError)return {data:null,error:rpcError};if(name==='elleng_prepare_weighted_draft')server=api.prepare(server);else{const i=args.p_golfer_index;server.golfers[i].team=1;server.teams[1].roster.push(i);server.picks.push({team:1,golfer:i});}return {data:server,error:null};},from:()=>({select:()=>({eq:()=>({single:async()=>{reads++;return {data:{state:structuredClone(server),owner_id:'owner',updated_at:'2026-01-02'},error:null}}})})})}};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('load=async function('),source.indexOf('async function secureSave()')),ctx);
 vm.runInContext(source.slice(source.indexOf('function sameCommissionerAction('),source.indexOf('function readSetupFields()')),ctx);
 vm.runInContext(source.slice(source.indexOf('if(document.getElementById("prepareWeighted"))'),source.indexOf('document.getElementById("setupBtn").onclick')),ctx);
 return {ctx,elements,reads:()=>reads,setServer:x=>{server=x;},getServer:()=>server,setRpcError:e=>{rpcError=e}};
}
test('prepare refreshes authoritative state while write lock remains held',async()=>{const h=harness();await h.elements.prepareWeighted.onclick();assert.equal(h.reads(),1);assert.equal(h.ctx.S.draftRules,'weighted');assert.equal(h.ctx.S.picks.length,2);assert.equal(h.ctx.draftUpdatedAt,'2026-01-02');assert.equal(h.ctx.savingDraft,false);});
test('weighted commissioner pick refreshes roster and concurrency timestamp',async()=>{const h=harness();const s=api.prepare(h.ctx.S);s.timerPaused=false;h.ctx.S=s;h.setServer(structuredClone(s));await h.ctx.pick(2);assert.equal(h.reads(),1);assert.equal(h.ctx.S.golfers[2].team,1);assert.equal(h.ctx.S.picks.length,3);assert.equal(h.ctx.draftUpdatedAt,'2026-01-02');});
test('undo does not remove a captain seed',()=>{const h=harness();h.ctx.S=api.prepare(h.ctx.S);h.elements.undo={};vm.runInContext(source.slice(source.indexOf('document.getElementById("undo").onclick'),source.indexOf('document.getElementById("pause").onclick')),h.ctx);h.elements.undo.onclick();assert.equal(h.ctx.S.picks.length,2);assert.equal(h.ctx.S.golfers[1].team,1);});

test('rejected weighted commissioner pick leaves local draft unchanged',async()=>{
 const h=harness();const prepared=api.prepare(h.ctx.S);prepared.timerPaused=false;h.ctx.S=prepared;h.setServer(structuredClone(prepared));h.setRpcError(new Error('Server rejected selection'));h.ctx.alert=message=>{h.ctx.lastAlert=message};
 const before=structuredClone(h.ctx.S);await h.ctx.pick(2);
 assert.deepEqual(h.ctx.S,before);assert.equal(h.reads(),0);assert.equal(h.ctx.savingDraft,false);assert.match(h.ctx.lastAlert,/Server rejected selection/);
});
test('rejected weighted preparation leaves local draft unchanged',async()=>{
 const h=harness();h.setRpcError(new Error('Server rejected preparation'));h.ctx.alert=message=>{h.ctx.lastAlert=message};
 const before=structuredClone(h.ctx.S);await h.elements.prepareWeighted.onclick();
 assert.deepEqual(h.ctx.S,before);assert.equal(h.reads(),0);assert.equal(h.ctx.savingDraft,false);assert.match(h.ctx.lastAlert,/Server rejected preparation/);
});

test('rejected weighted pause save explains failure and restores local state',async()=>{
 const h=harness();h.ctx.S=api.prepare(h.ctx.S);h.ctx.S.timerPaused=true;
 h.ctx.savingDraft=false;h.ctx.alert=message=>{h.ctx.lastAlert=message};
 h.ctx.save=async()=>{throw new Error('Draft was changed by another session')};
 h.elements.pause={};h.elements.undo={};
 vm.runInContext(source.slice(source.indexOf('async function saveCommissionerAction('),source.indexOf('document.getElementById("resetClock").onclick')),h.ctx);
 const before=structuredClone(h.ctx.S);
 await h.elements.pause.onclick();
 assert.deepEqual(h.ctx.S,before);
 assert.match(h.ctx.lastAlert,/changed by another session/);
});
