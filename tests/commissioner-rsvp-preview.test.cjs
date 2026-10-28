'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create,summarize}=require('../commissioner-rsvp-preview.js');
const eligibility=require('../event-rsvp-eligibility.js');
const directory=[{name:'Alice'},{name:'Bob'},{name:'Carol'}];
const teams=[{},{}];
const rows=[0,1].map(i=>({
 tournament_id:'nov20',user_id:'account-'+i,golfer_index:i,
 status:'playing',approval_status:'approved'
}));
function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject};
}
function harness(eventId='nov20'){
 const authReads=[],listReads=[],renders=[],writes=[];
 let auth={epoch:3,userId:'commissioner-a'};
 const db={
  auth:{getUser:()=>{const d=deferred();authReads.push(d);return d.promise}},
  from:()=>{writes.push('from');throw Error('unexpected direct table access')},
  rpc:()=>{writes.push('rpc');throw Error('unexpected database write')}
 };
 const client={list:(database,id)=>{
  assert.equal(database,db);assert.equal(id,'nov20');
  const d=deferred();listReads.push(d);return d.promise;
 }};
 const draft={golfers:structuredClone(directory),teams:structuredClone(teams)};
 const controller=create({db,client,eligibility,eventId,getAuth:()=>auth,
  getDraft:()=>draft,render:value=>renders.push(value)});
 return {controller,authReads,listReads,renders,writes,draft,
  signout:()=>{auth={epoch:auth.epoch+1,userId:null}},
  switchUser:()=>{auth={epoch:auth.epoch+1,userId:'commissioner-b'}}};
}
test('read-only summary reports approved players and unapproved named slots',()=>{
 const result=summarize(rows,'nov20',directory,2,eligibility);
 assert.equal(result.approvedCount,2);
 assert.deepEqual(result.approvedIndices,[0,1]);
 assert.deepEqual(result.unapprovedNamedIndices,[2]);
 assert.equal(result.matchesPreview,false);
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(result.approvedIndices));
 const clean=summarize(rows,'nov20',directory.slice(0,2),2,eligibility);
 assert.equal(clean.matchesPreview,true);
 assert.equal(summarize([], 'nov20', [],2,eligibility).matchesPreview,false);
 assert.throws(()=>summarize(rows,'nov20',directory,1,eligibility),RangeError);
});
test('verified commissioner can preview without altering draft or writing database',async()=>{
 const h=harness(),before=structuredClone(h.draft);
 const work=h.controller.refresh();
 assert.equal(h.renders[0].status,'loading');
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.listReads.length,1);
 h.listReads[0].resolve(rows);await work;
 assert.equal(h.renders.at(-1).status,'success');
 assert.equal(h.renders.at(-1).summary.approvedCount,2);
 assert.deepEqual(h.draft,before);
 assert.deepEqual(h.writes,[]);
});
test('signout during authentication prevents even an RSVP read',async()=>{
 const h=harness(),work=h.controller.refresh();
 h.signout();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await work;
 assert.equal(h.listReads.length,0);
 assert.deepEqual(h.renders.map(x=>x.status),['loading']);
});
test('old commissioner RSVP result cannot render after account switch',async()=>{
 const h=harness(),work=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.switchUser();
 h.listReads[0].resolve(rows);await work;
 assert.deepEqual(h.renders.map(x=>x.status),['loading']);
});
test('newer RSVP refresh wins over stale response from same commissioner',async()=>{
 const h=harness(),first=h.controller.refresh(),second=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 h.authReads[1].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.listReads.length,1);
 h.listReads[0].resolve(rows.slice(0,1));await second;await first;
 assert.equal(h.renders.at(-1).summary.approvedCount,1);
 assert.deepEqual(h.renders.map(x=>x.status),['loading','loading','success']);
});
test('authentication mismatch and invalid RSVP data fail closed',async()=>{
 const h=harness(),first=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'other'}},error:null});await first;
 assert.deepEqual(h.renders.map(x=>x.status),['loading','error']);
 assert.equal(h.listReads.length,0);
 const second=h.controller.refresh();
 h.authReads[1].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.listReads[0].resolve([{...rows[0],golfer_index:99}]);await second;
 assert.equal(h.renders.at(-1).status,'error');
 assert.ok(!h.renders.some(x=>x.status==='success'));
});
test('explicitly disabled preview never accesses event RSVP data',async()=>{
 const h=harness('');
 await h.controller.refresh();
 assert.equal(h.controller.enabled,false);
 assert.equal(h.authReads.length,0);
 assert.equal(h.listReads.length,0);
 assert.equal(h.renders.at(-1).status,'disabled');
});
test('explicit invalidation fences an in-flight preview',async()=>{
 const h=harness(),work=h.controller.refresh();
 h.controller.invalidate();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await work;
 assert.equal(h.listReads.length,0);
});

test('commissioner UI keeps event RSVP preview opt-in and read-only',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const html=fs.readFileSync('admin.html','utf8');
 const config=fs.readFileSync('config.js','utf8');
 const context={window:{}};
 vm.runInNewContext(config,context);
 assert.equal(context.window.ELLENG_CONFIG.eventRsvpPreviewEnabled,false);
 assert.equal(context.window.ELLENG_CONFIG.eventRsvpTournamentId,'elleng-cup-live');
 assert.match(html,/id="refreshRsvpPreview"[^>]*disabled/);
 assert.match(html,/id="rsvpReadinessStatus"[^>]*role="status"/);
 assert.ok(html.indexOf('src="event-rsvp-client.js"')<html.indexOf('src="commissioner-rsvp-preview.js"'));
 assert.ok(html.indexOf('src="event-rsvp-eligibility.js"')<html.indexOf('src="commissioner-rsvp-preview.js"'));
 assert.match(html,/cfg\.eventRsvpPreviewEnabled===true/);
 assert.match(html,/rsvpPreviewController\.invalidate\(\)/);
 assert.match(html,/document\.getElementById\("refreshRsvpPreview"\)\.onclick=\(\)=>rsvpPreviewController\.refresh\(\)/);
});

test('commissioner preview fails closed when a previously valid roster is replaced by duplicate identities',async()=>{
 const h=harness();
 const first=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.listReads[0].resolve(rows);await first;
 assert.equal(h.renders.at(-1).status,'success');
 const second=h.controller.refresh();
 h.authReads[1].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.listReads[1].resolve([rows[0],{...rows[1],golfer_index:0}]);
 await second;
 assert.equal(h.renders.at(-1).status,'error');
 assert.deepEqual(h.writes,[]);
});
test('preview invalidation after RSVP read begins prevents stale render',async()=>{
 const h=harness(),work=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.listReads.length,1);
 h.controller.invalidate();
 h.listReads[0].resolve(rows);
 await work;
 assert.deepEqual(h.renders.map(x=>x.status),['loading','invalidated']);
 assert.deepEqual(h.writes,[]);
});

test('commissioner preview rejects approved but non-playing RSVP and duplicate accounts',()=>{
 const notPlaying=[{...rows[0],status:'out'},rows[1]];
 const result=summarize(notPlaying,'nov20',directory,2,eligibility);
 assert.deepEqual(result.approvedIndices,[1]);
 assert.equal(result.matchesPreview,false);
 assert.throws(()=>summarize([rows[0],{...rows[1],user_id:rows[0].user_id}],'nov20',directory,2,eligibility),/Duplicate event RSVP user/);
});
test('account switch during rejected RSVP request does not show old-account error',async()=>{
 const h=harness(),work=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.switchUser();
 h.listReads[0].reject(new Error('old account network failure'));
 await work;
 assert.deepEqual(h.renders.map(x=>x.status),['loading']);
 assert.deepEqual(h.writes,[]);
});

test('commissioner preview requires reconciliation helper and fails closed on mismatch',()=>{
 const broken={...eligibility,reconcileDraftRoster:()=>({ready:false,missingIndices:[0],mismatchedIndices:[]})};
 const result=summarize(rows,'nov20',directory.slice(0,2),2,broken);
 assert.equal(result.matchesPreview,false);
 assert.equal(result.missingApprovedCount,1);
 assert.deepEqual(result.missingApprovedIndices,[0]);
 assert.ok(Object.isFrozen(result.missingApprovedIndices));
 assert.equal(result.mismatchedApprovedCount,0);
});

test('commissioner roster preview refuses ambiguous duplicate golfer names',()=>{
 const duplicate=[{name:'Alice'},{name:' alice '}];
 const result=summarize(rows,'nov20',duplicate,2,eligibility);
 assert.equal(result.approvedCount,2);
 assert.equal(result.duplicateNamedCount,1);
 assert.deepEqual(result.duplicateNamedIndices,[1]);
 assert.equal(result.matchesPreview,false);
 assert.ok(Object.isFrozen(result.duplicateNamedIndices));
});

test('commissioner preview counts unnamed draft slots without treating them as approved',()=>{
 const result=summarize(rows.slice(0,1),'nov20',[{name:'Alice'},{name:''}],2,eligibility);
 assert.equal(result.unnamedSlotCount,1);
 assert.equal(result.approvedCount,1);
 assert.equal(result.matchesPreview,false);
});

test('approved seat coverage uses full draft size and does not imply readiness',()=>{
 const result=summarize(rows,'nov20',[...directory,{name:''}],2,eligibility);
 assert.equal(result.approvedSeatCoverage,0.5);
 assert.equal(result.matchesPreview,false);
 assert.equal(summarize([],'nov20',[],2,eligibility).approvedSeatCoverage,0);
});

test('fully approved named subset does not mark a partially configured draft ready',()=>{
 const draft=[{name:'Alice'},{name:'Bob'},{name:''}];
 const result=summarize(rows,'nov20',draft,2,eligibility);
 assert.equal(result.approvedCount,2);
 assert.equal(result.unnamedSlotCount,1);
 assert.equal(result.shortfall,0);
 assert.equal(result.matchesPreview,false);
});

test('controller rejects missing reconciliation dependency before any authenticated read',()=>{
 const db={auth:{getUser:()=>{throw Error('must not read auth')}}};
 const client={list:()=>{throw Error('must not list RSVPs')}};
 assert.throws(()=>create({db,client,eligibility:{approvedRoster:eligibility.approvedRoster},eventId:'nov20',getAuth:()=>({epoch:1,userId:'a'}),getDraft:()=>({golfers:directory,teams}),render:()=>{}}),/dependencies required/);
});

test('invalidation clears a previously successful commissioner readiness preview',async()=>{
 const h=harness(),work=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.listReads[0].resolve(rows);
 await work;
 assert.equal(h.renders.at(-1).status,'success');
 h.controller.invalidate();
 assert.equal(h.renders.at(-1).status,'invalidated');
 assert.deepEqual(h.writes,[]);
});

test('refresh clears previous readiness before authentication and RSVP fetch finish',async()=>{
 const h=harness();
 const first=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.listReads[0].resolve(rows);await first;
 assert.equal(h.renders.at(-1).status,'success');
 const second=h.controller.refresh();
 assert.equal(h.renders.at(-1).status,'loading');
 h.authReads[1].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.listReads[1].reject(new Error('network unavailable'));
 await second;
 assert.equal(h.renders.at(-1).status,'error');
 assert.deepEqual(h.writes,[]);
});
test('invalidation during a newer refresh cannot restore previous approved summary',async()=>{
 const h=harness();
 const first=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.listReads[0].resolve(rows);await first;
 const pending=h.controller.refresh();
 h.authReads[1].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.controller.invalidate();
 h.listReads[1].resolve(rows);
 await pending;
 assert.equal(h.renders.at(-1).status,'invalidated');
 assert.deepEqual(h.writes,[]);
});

test('signed-out refresh clears previously successful RSVP preview without reading database',async()=>{
 const h=harness(),first=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.listReads[0].resolve(rows);await first;
 assert.equal(h.renders.at(-1).status,'success');
 h.signout();
 await h.controller.refresh();
 assert.equal(h.renders.at(-1).status,'invalidated');
 assert.equal(h.authReads.length,1);
 assert.equal(h.listReads.length,1);
 assert.deepEqual(h.writes,[]);
});

test('commissioner RSVP preview ignores other events but rejects malformed current-event records',()=>{
 const valid=summarize([...rows,{tournament_id:'other-event',user_id:'foreign',golfer_index:999,status:'invalid',approval_status:'invalid'}],'nov20',directory.slice(0,2),2,eligibility);
 assert.equal(valid.matchesPreview,true);
 assert.deepEqual(valid.approvedIndices,[0,1]);
 assert.throws(()=>summarize([...rows,{tournament_id:'nov20',user_id:'bad',golfer_index:2,status:'invalid',approval_status:'approved'}],'nov20',directory,2,eligibility),/Invalid RSVP status/);
});

test('commissioner preview refuses non-callable dependencies before any request',()=>{
 const db={auth:{getUser:()=>{throw Error('should not read')}}};
 const client={list:()=>{throw Error('should not list')}}};
 const args={db,client,eligibility,eventId:'nov20',getAuth:()=>({epoch:1,userId:'commissioner-a'}),getDraft:()=>({golfers:directory,teams}),render:()=>{}};
 for(const override of [
  {db:{auth:{getUser:true}}},
  {client:{list:true}},
  {eligibility:{...eligibility,approvedRoster:true}},
  {eligibility:{...eligibility,reconcileDraftRoster:true}}
 ])assert.throws(()=>create({...args,...override}),/dependencies required/);
});
