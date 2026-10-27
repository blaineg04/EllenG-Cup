/* Staged RSVP controller for EllenG Cup.
 * Default mode is legacy. Event mode requires an explicit trusted rollout flag.
 * No automatic fallback to legacy writes after an event-RPC failure.
 */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('./event-rsvp-client.js'):root.EllenGEventRsvp);
 if(typeof module==='object'&&module.exports) module.exports=api;
 else root.EllenGRsvpRollout=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(eventClient){
 function create({db,tournamentId,verifiedGolferIndex,eventMode=false,legacy}){
   if(!legacy||typeof legacy.load!=='function'||typeof legacy.submit!=='function'||typeof legacy.clear!=='function')
     throw new TypeError('Legacy RSVP handlers required');
   if(eventMode&&(!eventClient||!db||!tournamentId))
     throw new TypeError('Event RSVP rollout requires database, tournament and adapter');
   return Object.freeze({
     mode:eventMode?'event':'legacy',
     async load(){return eventMode?eventClient.list(db,tournamentId):legacy.load()},
     async submit(status){
       if(!['playing','maybe','out'].includes(status)) throw new TypeError('Invalid RSVP status');
       if(eventMode)return eventClient.submit(db,tournamentId,verifiedGolferIndex,status);
       return legacy.submit(status);
     },
     async clear(){return eventMode?eventClient.clear(db,tournamentId):legacy.clear()}
   });
 }
 return Object.freeze({create});
});
