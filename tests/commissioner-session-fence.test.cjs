'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('admin.html','utf8');
const varsStart=source.indexOf('let commissionerAuthEpoch=0,commissionerOpenId=0,commissionerUserId=null;');
const saveStart=source.indexOf('async function secureSave()');
const saveEnd=source.indexOf('save=secureSave;',saveStart);
const authStart=source.indexOf('function revokeCommissionerSession()');
const authEnd=source.indexOf('document.getElementById("login").onclick',authStart);
assert.ok(varsStart>0&&saveStart>varsStart&&saveEnd>saveStart&&authStart>saveEnd&&authEnd>authStart);
const code=source.slice(varsStart,source.indexOf('\n',varsStart)+1)+'\n'+
 source.slice(saveStart,saveEnd)+'\n'+source.slice(authStart,authEnd)+
 '\nthis.openAdmin=openAdmin;this.secureSave=secureSave;';
function harness(){
 const elements={loginCard:{style:{display:'block'}},adminApp:{style:{display:'none'}},
  authMsg:{textContent:''},connection:{textContent:''}};
 const buttons=[{disabled:false}],authReads=[],draftReads=[],writes=[];
 let authChanged,subscriptions=0;
 const ctx={draftUpdatedAt:null,savingDraft:false,tick:null,liveMode:false,S:{picks:[]},
  fresh:()=>({picks:[]}),cfg:{draftId:'synthetic-only'},
  document:{getElementById:id=>elements[id],querySelectorAll:()=>buttons},
  db:{auth:{getUser:()=>new Promise(resolve=>authReads.push(resolve)),
   onAuthStateChange:cb=>{authChanged=cb}},
   from:()=>({select:()=>({eq:()=>({maybeSingle:()=>new Promise(resolve=>draftReads.push(resolve))})}),
    insert:()=>{writes.push('insert');throw Error('unexpected insert')}}),
   rpc:()=>{writes.push('rpc');throw Error('unexpected rpc')}},
  setupRender:()=>{},subscribe:()=>{subscriptions++},setInterval:()=>1,
  alert:()=>{},console:{error:()=>{}}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 return {ctx,elements,buttons,authReads,draftReads,writes,
  open:()=>ctx.openAdmin(),save:()=>ctx.secureSave(),change:(event,session)=>authChanged(event,session),
  auth:(index,id)=>authReads[index]({data:{user:id?{id}:null},error:null}),
  draft:(index,id)=>draftReads[index]({data:{state:{picks:[]},owner_id:id,updated_at:'2026-10-27T00:00:00Z'},error:null}),
  subscriptions:()=>subscriptions};
}
test('signout invalidates pending commissioner lookup without reopening controls',async()=>{
 const h=harness(),pending=h.open();
 h.change('SIGNED_OUT',null);
 h.auth(0,'commissioner-a');await pending;
 assert.equal(h.draftReads.length,0);
 assert.equal(h.elements.adminApp.style.display,'none');
 assert.equal(h.elements.connection.textContent,'SIGN IN');
 assert.equal(h.subscriptions(),0);
 assert.equal(h.buttons[0].disabled,true);
});
test('only the newest commissioner lookup can grant access',async()=>{
 const h=harness(),older=h.open(),newer=h.open();
 h.auth(1,'commissioner-b');await Promise.resolve();
 assert.equal(h.draftReads.length,1);
 h.draft(0,'commissioner-b');await newer;
 h.auth(0,'commissioner-a');await older;
 assert.equal(h.elements.adminApp.style.display,'block');
 assert.equal(h.draftReads.length,1);
 assert.equal(h.subscriptions(),1);
 assert.equal(vm.runInContext('commissionerUserId',h.ctx),'commissioner-b');
});
test('account switch revokes already verified commissioner controls',async()=>{
 const h=harness(),pending=h.open();
 h.auth(0,'commissioner-a');await Promise.resolve();
 h.draft(0,'commissioner-a');await pending;
 assert.equal(h.elements.adminApp.style.display,'block');
 h.change('SIGNED_IN',{user:{id:'commissioner-b'}});
 assert.equal(h.elements.adminApp.style.display,'none');
 assert.equal(h.elements.connection.textContent,'SIGN IN');
 assert.equal(vm.runInContext('commissionerUserId',h.ctx),null);
 assert.equal(h.buttons[0].disabled,true);
});
test('signout during save authentication prevents commissioner database write',async()=>{
 const h=harness(),opened=h.open();
 h.auth(0,'commissioner-a');await Promise.resolve();
 h.draft(0,'commissioner-a');await opened;
 const saving=h.save();
 assert.equal(h.authReads.length,2);
 h.change('SIGNED_OUT',null);
 h.auth(1,'commissioner-a');
 await assert.rejects(saving,/session changed while saving/);
 assert.deepEqual(h.writes,[]);
 assert.equal(h.elements.adminApp.style.display,'none');
});
