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
function harness(eventId='nov20',hasPendingRosterEdits=()=>false){
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
  getDraft:()=>draft,hasPendingRosterEdits,render:value=>renders.push(value)});
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
test('sparse golfer slots cannot be treated as complete draft readiness',()=>{
 const sparse=Array(3);
 sparse[0]={name:'Alice'};
 sparse[1]={name:'Bob'};
 const result=summarize(rows,'nov20',sparse,2,eligibility);
 assert.equal(result.unnamedSlotCount,1);
 assert.equal(result.matchesPreview,false);
 assert.equal(result.independentlyVerified,false);
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

test('commissioner preview does not claim independent verification from a draft self-comparison',()=>{
 const guarded={...eligibility,reconcileDraftRoster:()=>{throw Error('self-reconciliation is forbidden')}};
 const result=summarize(rows,'nov20',directory.slice(0,2),2,guarded);
 assert.equal(result.matchesPreview,true);
 assert.equal(result.independentlyVerified,false);
 assert.equal('missingApprovedCount' in result,false);
 assert.equal('mismatchedApprovedCount' in result,false);
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

test('controller rejects missing approved roster dependency before any authenticated read',()=>{
 const db={auth:{getUser:()=>{throw Error('must not read auth')}}};
 const client={list:()=>{throw Error('must not list RSVPs')}};
 assert.throws(()=>create({db,client,eligibility:{reconcileDraftRoster:eligibility.reconcileDraftRoster},eventId:'nov20',getAuth:()=>({epoch:1,userId:'a'}),getDraft:()=>({golfers:directory,teams}),render:()=>{}}),/dependencies required/);
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
 const client={list:()=>{throw Error('should not list')}};
 const args={db,client,eligibility,eventId:'nov20',getAuth:()=>({epoch:1,userId:'commissioner-a'}),getDraft:()=>({golfers:directory,teams}),render:()=>{}};
 for(const override of [
  {db:{auth:{getUser:true}}},
  {client:{list:true}},
  {eligibility:{...eligibility,approvedRoster:true}}
 ])assert.throws(()=>create({...args,...override}),/dependencies required/);
});

test('commissioner UI invalidates RSVP readiness when golfer details or roster size are edited',()=>{
 const html=require('node:fs').readFileSync('admin.html','utf8');
 assert.ok(html.includes('document.getElementById("trows")?.addEventListener?.("input",()=>rsvpPreviewController.invalidate());'));
 assert.ok(html.includes('document.getElementById("dtype")?.addEventListener?.("change",()=>{updateDraftSetupPreview();rsvpPreviewController.invalidate()});'));
 for(const id of ['grows','setupTeamCount','setupGolferCount']){
  assert.ok(html.includes('document.getElementById("'+id+'")?.addEventListener?.("input",()=>{updateDraftSetupPreview();rsvpPreviewController.invalidate()});'));
 }
});

test('RSVP preview never claims independent roster verification',()=>{
 const result=summarize(rows,'nov20',directory,2,eligibility);
 assert.equal(result.independentlyVerified,false);
});


test('remote draft application and confirmed saves revoke RSVP readiness',()=>{
 const html=require('node:fs').readFileSync('admin.html','utf8');
 const loadBlock=html.slice(html.indexOf('load=async function'),html.indexOf('async function secureSave'));
 const saveBlock=html.slice(html.indexOf('async function secureSave'),html.indexOf('save=secureSave;'));
 const applied=loadBlock.indexOf('S={...fresh(),...data.state};');
 const remoteInvalidate=loadBlock.indexOf('rsvpPreviewController.invalidate();');
 const remoteRead=loadBlock.indexOf('db.from("elleng_drafts")');
 assert.ok(remoteInvalidate>=0 && remoteRead>remoteInvalidate,'RSVP readiness must clear before remote draft read');
 assert.ok(applied>remoteRead);
 assert.ok(loadBlock.indexOf('onApplied();')>applied);
 const saveStarted=saveBlock.indexOf('savingDraft=true;');
 const firstInvalidate=saveBlock.indexOf('rsvpPreviewController.invalidate();');
 const saved=saveBlock.indexOf('draftUpdatedAt=saved.updated_at;');
 const confirmedInvalidate=saveBlock.lastIndexOf('rsvpPreviewController.invalidate();');
 assert.ok(saveStarted>=0 && firstInvalidate>saveStarted && firstInvalidate<saved,
  'a pending or failed save must immediately clear the previous approval result');
 assert.ok(saved>=0 && confirmedInvalidate>saved);
 assert.ok(saveBlock.indexOf('}catch(error)')>confirmedInvalidate);
 assert.equal(loadBlock.split('rsvpPreviewController.invalidate();').length-1,1);
 assert.equal(saveBlock.split('rsvpPreviewController.invalidate();').length-1,2);
});

test('second-device roster replacement revokes old preview and fences a pending RSVP read',async()=>{
 const h=harness();
 const first=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.listReads[0].resolve(rows);await first;
 assert.equal(h.renders.at(-1).status,'success');
 const pending=h.controller.refresh();
 h.authReads[1].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 // Model a Realtime-applied draft containing an ambiguous duplicate name.
 h.draft.golfers[1].name='Alice';
 h.controller.invalidate();
 h.listReads[1].resolve(rows);
 await pending;
 assert.equal(h.renders.at(-1).status,'invalidated');
 const refreshed=h.controller.refresh();
 h.authReads[2].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.listReads[2].resolve(rows);
 await refreshed;
 assert.equal(h.renders.at(-1).status,'success');
 assert.equal(h.renders.at(-1).summary.duplicateNamedCount,1);
 assert.equal(h.renders.at(-1).summary.matchesPreview,false);
 assert.deepEqual(h.writes,[]);
});

test('unsaved roster inputs block RSVP reads before authentication and recover after save',async()=>{
 let unsaved=true;
 const h=harness('nov20',()=>unsaved);
 await h.controller.refresh();
 assert.deepEqual(h.renders.map(x=>x.status),['loading','unsaved']);
 assert.equal(h.authReads.length,0);
 assert.equal(h.listReads.length,0);
 unsaved=false;
 const next=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.listReads[0].resolve(rows);await next;
 assert.equal(h.renders.at(-1).status,'success');
 assert.deepEqual(h.writes,[]);
});

test('roster edits while commissioner authentication is pending prevent RSVP read',async()=>{
 let unsaved=false;
 const h=harness('nov20',()=>unsaved),pending=h.controller.refresh();
 unsaved=true;
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await pending;
 assert.equal(h.renders.at(-1).status,'unsaved');
 assert.equal(h.listReads.length,0);
 assert.deepEqual(h.writes,[]);
});

test('roster edits during RSVP network read cannot restore stale readiness',async()=>{
 let unsaved=false;
 const h=harness('nov20',()=>unsaved),pending=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.listReads.length,1);
 unsaved=true;
 h.listReads[0].resolve(rows);await pending;
 assert.equal(h.renders.at(-1).status,'unsaved');
 assert.equal(h.renders.some(x=>x.status==='success'),false);
 assert.deepEqual(h.writes,[]);
});

test('commissioner readiness refuses all unsaved golfer, team and draft setup edits',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const html=fs.readFileSync('admin.html','utf8');
 const start=html.indexOf('function hasPendingRosterEdits(){');
 const end=html.indexOf('function updateDraftSetupPreview()',start);
 assert.ok(start>0&&end>start,'real read-only setup guard must exist');
 const field=(key,index,value)=>({dataset:{[key]:String(index)},value});
 const names=[field('n',0,'Alice'),field('n',1,'Bob')];
 const handicaps=[field('h',0,'9'),field('h',1,'17')];
 const bands=[field('b',0,'A'),field('b',1,'B')];
 const teamNames=[field('tn',0,'Team 1'),field('tn',1,'Team 2')];
 const captains=[field('tc',0,'Alice'),field('tc',1,'Bob')];
 const fields={
  '#grows [data-n]':names,'#grows [data-h]':handicaps,
  '#grows [data-b]':bands,'#trows [data-tn]':teamNames,
  '#trows [data-tc]':captains
 };
 const controls={
  setupTeamCount:{value:'2'},setupGolferCount:{value:'2'},
  dtype:{value:'snake'},tlen:{value:'60'}
 };
 const ctx={savingDraft:false,
  S:{golfers:[{name:'Alice',hcp:'9',band:'A'},{name:'Bob',hcp:'17',band:'B'}],
   teams:[{name:'Team 1',captain:'Alice'},{name:'Team 2',captain:'Bob'}],
   draftType:'snake',timerLength:60},
  document:{querySelectorAll:selector=>fields[selector]||[],
   getElementById:id=>controls[id]}};
 vm.createContext(ctx);
 vm.runInContext(html.slice(start,end)+'\nthis.check=hasPendingRosterEdits;',ctx);
 assert.equal(ctx.check(),false);
 function changed(control,value){
  const before=control.value;
  control.value=value;
  assert.equal(ctx.check(),true,'unsaved '+value+' must block RSVP readiness');
  control.value=before;
  assert.equal(ctx.check(),false,'restored setup must clear unsaved guard');
 }
 changed(names[1],'Carol');
 changed(handicaps[0],'12');
 changed(bands[0],'D');
 changed(teamNames[0],'Visitors');
 changed(captains[1],'Carol');
 changed(controls.dtype,'straight');
 changed(controls.tlen,'90');
 changed(controls.setupTeamCount,'3');
 changed(controls.setupGolferCount,'3');
 names[1].value=' Bob ';
 assert.equal(ctx.check(),false,'equivalent trimmed golfer name is unchanged');
 names[1].value='Bob';
 teamNames[0].value='';
 assert.equal(ctx.check(),false,'default empty team name saves as Team 1');
 teamNames[0].value='Team 1';
 names[1].dataset.n='0';
 assert.equal(ctx.check(),true,'duplicate golfer input indices must fail closed');
 names[1].dataset.n='1';
 const original=fields['#grows [data-b]'];
 fields['#grows [data-b]']=original.slice(0,1);
 assert.equal(ctx.check(),true,'missing handicap band input must fail closed');
 fields['#grows [data-b]']=original;
 ctx.savingDraft=true;
 assert.equal(ctx.check(),true,'in-flight draft save cannot certify roster');
 ctx.savingDraft=false;
 assert.equal(ctx.check(),false);
 assert.equal(html.includes('hasPendingRosterEdits,'),true);
 assert.equal(html.includes('result.status==="unsaved"'),true);
});

test('conflicting event golfer enrollment fails closed even if only one account is approved',()=>{
 const adapter=require('../event-rsvp-client.js');
 const pending={tournament_id:'nov20',user_id:'second-account',golfer_index:0,
  status:null,approval_status:'pending'};
 const approved=rows.slice(0,2);
 for(const conflict of [[...approved,pending],[pending,...approved]]){
  assert.throws(()=>eligibility.approvedRoster(conflict,'nov20',directory),/Duplicate approved golfer or event enrollment/);
  assert.throws(()=>adapter.approvedGolferIndices(conflict,'nov20',directory),/Duplicate approved golfer or event enrollment/);
  assert.throws(()=>summarize(conflict,'nov20',directory.slice(0,2),2,eligibility),/Duplicate approved golfer or event enrollment/);
 }
 // Enrollment indices are event-scoped; a different tournament is not a conflict.
 const foreign={...pending,tournament_id:'other-event'};
 assert.deepEqual(eligibility.approvedRoster([...approved,foreign],'nov20',directory),[0,1]);
 assert.deepEqual(adapter.approvedGolferIndices([...approved,foreign],'nov20',directory),[0,1]);
});
test('pending and declined accounts cannot share one event golfer index',()=>{
 const adapter=require('../event-rsvp-client.js');
 const enrolled=[
  {tournament_id:'nov20',user_id:'account-pending',golfer_index:0,status:null,approval_status:'pending'},
  {tournament_id:'nov20',user_id:'account-declined',golfer_index:0,status:'out',approval_status:'declined'}
 ];
 assert.throws(()=>eligibility.approvedRoster(enrolled,'nov20',directory),/Duplicate approved golfer or event enrollment/);
 assert.throws(()=>adapter.approvedGolferIndices(enrolled,'nov20',directory),/Duplicate approved golfer or event enrollment/);
});

test('draft mutation during authentication prevents RSVP read and readiness claim',async()=>{
 const h=harness(),pending=h.controller.refresh();
 assert.equal(h.renders.at(-1).status,'loading');
 // Simulate a remote draft update applied before the authentication promise resolves.
 h.draft.golfers[0].name='Alice (updated on second device)';
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await pending;
 assert.equal(h.listReads.length,0,'do not query RSVPs against a superseded draft');
 assert.deepEqual(h.renders.map(x=>x.status),['loading','stale']);
 assert.deepEqual(h.writes,[]);
});

test('draft mutation during RSVP fetch cannot restore previous green readiness',async()=>{
 const h=harness();
 // Establish a genuinely green baseline: both named slots have approved
 // Playing RSVPs. The default harness includes an unapproved third golfer.
 h.draft.golfers.pop();
 const first=h.controller.refresh();
 h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 h.listReads[0].resolve(rows);await first;
 assert.equal(h.renders.at(-1).summary.matchesPreview,true);
 const second=h.controller.refresh();
 h.authReads[1].resolve({data:{user:{id:'commissioner-a'}},error:null});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.listReads.length,2);
 // Changing team configuration in place must be detected even if a Realtime
 // callback has not yet invalidated the previous preview request.
 h.draft.teams[0].name='Updated on second device';
 h.listReads[1].resolve(rows);
 await second;
 assert.deepEqual(h.renders.slice(-2).map(x=>x.status),['loading','stale']);
 assert.equal(h.renders.filter(x=>x.status==='success').length,1);
 assert.deepEqual(h.writes,[]);
});

test('commissioner UI explains changed-draft RSVP results without implying approval',()=>{
 const html=require('node:fs').readFileSync('admin.html','utf8');
 assert.match(html,/result\.status==="stale"/);
 assert.match(html,/Draft roster changed while checking RSVPs/);
});

test('pending and declined event enrollments outside the draft directory fail closed',()=>{
 const adapter=require('../event-rsvp-client.js');
 const complete=directory.slice(0,2);
 for(const status of [null,'maybe','out']){
  const enrollment={
   tournament_id:'nov20',user_id:'unassigned-'+String(status),
   golfer_index:complete.length,status,
   approval_status:status==='out'?'declined':'pending'
  };
  for(const records of [[...rows,enrollment],[enrollment,...rows]]){
   assert.throws(
    ()=>eligibility.approvedRoster(records,'nov20',complete),
    /Event enrollment golfer index outside directory/
   );
   assert.throws(
    ()=>adapter.approvedGolferIndices(records,'nov20',complete),
    /Event enrollment golfer index outside directory/
   );
   assert.throws(
    ()=>summarize(records,'nov20',complete,2,eligibility),
    /Event enrollment golfer index outside directory/
   );
  }
  // Enrollment indices belong to an event; unrelated events must not
  // affect the November 20 read-only preview.
  const otherEvent={...enrollment,tournament_id:'other-event'};
  assert.deepEqual(eligibility.approvedRoster([...rows,otherEvent],'nov20',complete),[0,1]);
  assert.deepEqual(adapter.approvedGolferIndices([...rows,otherEvent],'nov20',complete),[0,1]);
 }
});

test('draft pick and format changes during RSVP fetch cannot restore readiness',async()=>{
 const changes=[
  draft=>{draft.picks=[{golfer:0,team:0}];},
  draft=>{draft.teams[0].roster=[0];},
  draft=>{draft.draftType='straight';},
  draft=>{draft.timerLength=90;}
 ];
 for(const change of changes){
  const h=harness();
  h.draft.golfers.pop();
  const work=h.controller.refresh();
  h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.listReads.length,1);
  change(h.draft);
  h.listReads[0].resolve(rows);
  await work;
  assert.deepEqual(h.renders.map(x=>x.status),['loading','stale']);
  assert.deepEqual(h.writes,[]);
 }
});

test('pre-draft RSVP readiness never certifies a draft after picks or assignments begin',async()=>{
 const mutations=[
  draft=>{draft.picks=[{golfer:0,team:0}];},
  draft=>{draft.teams[0].roster=[0];},
  draft=>{draft.golfers[0].team=0;}
 ];
 for(const mutate of mutations){
  const h=harness();
  h.draft.golfers.pop(); // exactly two approved, named seats
  mutate(h.draft);
  const work=h.controller.refresh();
  h.authReads[0].resolve({data:{user:{id:'commissioner-a'}},error:null});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.listReads.length,1);
  h.listReads[0].resolve(rows);
  await work;
  assert.deepEqual(h.renders.map(x=>x.status),['loading','stale']);
  assert.equal(h.renders.some(x=>x.status==='success'),false);
  assert.deepEqual(h.writes,[]);
 }
});
