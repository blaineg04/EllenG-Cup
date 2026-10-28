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
 async function counts(db,tournamentId){
   requireClient(db);
   const id=requireId(tournamentId,'Tournament ID');
   const result=await db.rpc('elleng_event_rsvp_counts',{p_tournament_id:id});
   if(result.error) throw result.error;
   return Array.isArray(result.data)?result.data[0]||null:result.data;
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
 async function clear(db,tournamentId){
   requireClient(db);
   const id=requireId(tournamentId,'Tournament ID');
   const result=await db.rpc('elleng_clear_event_rsvp',{p_tournament_id:id});
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
 // Share the same validated eligibility rules with commissioner draft setup.
 function approvedGolferIndices(rows,tournamentId,availableGolfers){
   if(!Array.isArray(rows)) throw new TypeError('RSVP rows must be an array');
   const id=requireId(tournamentId,'Tournament ID');
   if(!Array.isArray(availableGolfers)) throw new TypeError('Golfer directory required');
   const seenUsers=new Set(), seenGolfers=new Set(), approved=[];
   for(const row of rows){
     if(!row||row.tournament_id!==id) continue;
     requireId(row.user_id,'Account ID');
     const index=requireIndex(row.golfer_index);
     // A non-approved RSVP can still indicate an orphaned enrollment.
     // Do not silently certify a roster when any event index is outside
     // the draft directory used by this read-only eligibility check.
     if(index>=availableGolfers.length) throw new Error('Event enrollment golfer index outside directory (missing from directory)');
     if(seenUsers.has(row.user_id)) throw new Error('Duplicate RSVP account in event');
     seenUsers.add(row.user_id);
     // NULL means enrolled but not yet RSVP'd; never count as Playing.
     if(row.status!==null&&!['playing','maybe','out'].includes(row.status)) throw new Error('Invalid RSVP status');
     if(!['pending','approved','declined'].includes(row.approval_status)) throw new Error('Invalid approval status');
     // One golfer slot cannot be assigned to two accounts, regardless of
     // which account has an approved Playing RSVP.
     if(seenGolfers.has(index)) throw new Error('Duplicate approved golfer or event enrollment');
     seenGolfers.add(index);
     if(row.status!=='playing'||row.approval_status!=='approved') continue;
     if(typeof availableGolfers[index]?.name!=='string'||!availableGolfers[index].name.trim())
       throw new Error('Approved golfer missing from directory');
     approved.push(index);
   }
   return approved.sort((a,b)=>a-b);
 }
 return Object.freeze({list,counts,submit,clear,enroll,decide,approvedGolferIndices});
});
