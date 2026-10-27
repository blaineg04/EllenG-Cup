/* EllenG Cup event-scoped RSVP adapter. Not activated in scoring.html.
 * The legacy draft-scoped RSVP path remains unchanged until migration approval.
 * Requires reviewed SQL migrations and authenticated RPC grants.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports) module.exports=api;
 else root.EllenGEventRsvp=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const allowed=new Set(['playing','maybe','out']);
 function requireId(value,label){
   if(typeof value!=='string'||!value.trim()) throw new TypeError(label+' is required');
   return value.trim();
 }
 function requireIndex(value){
   if(!Number.isInteger(value)||value<0) throw new TypeError('Verified golfer index required');
   return value;
 }
 function requireClient(db){
   if(!db||typeof db.rpc!=='function'||typeof db.from!=='function') throw new TypeError('Supabase client required');
   return db;
 }
 async function list(db,tournamentId){
   requireClient(db);
   const id=requireId(tournamentId,'Tournament ID');
   const result=await db.from('elleng_event_rsvps').select('tournament_id,user_id,golfer_index,status,approval_status,updated_at').eq('tournament_id',id);
   if(result.error) throw result.error;
   return result.data||[];
 }
 async function submit(db,tournamentId,verifiedGolferIndex,status){
   requireClient(db);
   const id=requireId(tournamentId,'Tournament ID');
   const index=requireIndex(verifiedGolferIndex);
   if(!allowed.has(status)) throw new TypeError('Invalid RSVP status');
   const result=await db.rpc('elleng_submit_event_rsvp',{p_tournament_id:id,p_golfer_index:index,p_status:status});
   if(result.error) throw result.error;
   return result.data;
 }
 async function enroll(db,tournamentId,userId,verifiedGolferIndex){
   requireClient(db);
   const id=requireId(tournamentId,'Tournament ID');
   const uid=requireId(userId,'Account ID');
   const index=requireIndex(verifiedGolferIndex);
   const result=await db.rpc('elleng_assign_event_golfer',{p_tournament_id:id,p_user_id:uid,p_golfer_index:index});
   if(result.error) throw result.error;
   return result.data;
 }
 async function decide(db,tournamentId,userId,decision){
   requireClient(db);
   const id=requireId(tournamentId,'Tournament ID');
   const uid=requireId(userId,'Account ID');
   if(!['approved','declined'].includes(decision)) throw new TypeError('Invalid approval decision');
   const result=await db.rpc('elleng_approve_event_rsvp',{p_tournament_id:id,p_user_id:uid,p_decision:decision});
   if(result.error) throw result.error;
   return result.data;
 }
 function approvedGolferIndices(rows){
   return [...new Set((rows||[]).filter(r=>r&&r.status==='playing'&&r.approval_status==='approved'&&Number.isInteger(r.golfer_index)&&r.golfer_index>=0).map(r=>r.golfer_index))];
 }
 return Object.freeze({list,submit,enroll,decide,approvedGolferIndices});
});
