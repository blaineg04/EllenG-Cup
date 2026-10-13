/* EllenG Cup quota state transitions. Pure functions; no persistence or authorization.
 * Server must enforce commissioner permissions, immutable approvals and concurrency.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.EllenGQuotaLock=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function cloneAssignments(assignments){
  if(!Array.isArray(assignments)||!assignments.length)return null;
  const seen=new Set(),copy=[];
  for(const p of assignments){
   if(!p||typeof p.id!=='string'||!p.id.trim()||seen.has(p.id)||
      !['A','B','C','D'].includes(p.band)||!Number.isInteger(p.quota)||p.quota<0||p.quota>200)return null;
   seen.add(p.id);copy.push({id:p.id,band:p.band,quota:p.quota});
  }
  return copy;
 }
 function approve(draft,approvedBy,approvedAt){
  if(!draft||draft.status!=='draft'||typeof approvedBy!=='string'||!approvedBy.trim()||
     typeof approvedAt!=='string'||!Number.isFinite(Date.parse(approvedAt)))
   return {ok:false,error:'Valid draft, approver and timestamp required'};
  const assignments=cloneAssignments(draft.players);
  if(!assignments)return {ok:false,error:'Invalid quota assignments'};
  return {ok:true,status:'approved',approvedBy,approvedAt,players:assignments};
 }
 function startPlay(approved){
  if(!approved||approved.status!=='approved'||!approved.approvedBy||!approved.approvedAt)
   return {ok:false,error:'Quotas must be approved before starting play'};
  const assignments=cloneAssignments(approved.players);
  if(!assignments)return {ok:false,error:'Invalid approved assignments'};
  return {ok:true,status:'locked',approvedBy:approved.approvedBy,approvedAt:approved.approvedAt,
   players:assignments};
 }
 function editDraft(state,players){
  if(!state||state.status!=='draft')return {ok:false,error:'Approved or locked quotas cannot be edited'};
  const assignments=cloneAssignments(players);
  if(!assignments)return {ok:false,error:'Invalid quota assignments'};
  return {ok:true,status:'draft',players:assignments};
 }
 return Object.freeze({approve,startPlay,editDraft});
});
