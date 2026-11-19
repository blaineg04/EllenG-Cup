'use strict';
// Browser-independent commissioner transfer screen renderer.
// All values are escaped. This screen cannot write draft data.
const {buildCommissionerTransferView,previewCommissionerChange}=require('./post-draft-commissioner-view.cjs');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function renderCommissionerTransfer(state,{operation='swap',golferIndex=null,otherGolferIndex=null,verified={}}={}){
 const view=buildCommissionerTransferView(state);
 const options=(items,selected)=>'<option value="">Select golfer</option>'+items.map(g=>
  '<option value="'+g.index+'"'+(g.index===selected?' selected':'')+(g.selectable?'':' disabled')+'>'+escapeHtml(g.name)+(g.captain?' (captain)':'')+'</option>').join('');
 const all=view.teams.flatMap(t=>t.golfers);
 const first=all.find(g=>g.index===golferIndex);
 const opposite=first?view.teams.find(t=>t.teamIndex!==state.golfers[golferIndex].team)?.golfers||[]:[];
 const result=first?previewCommissionerChange(state,operation,golferIndex,otherGolferIndex,verified):null;
 const summary=result?(result.ok?'<p role="status">'+escapeHtml(result.golfer)+' → '+escapeHtml(result.toTeam)+(operation==='swap'?' / '+escapeHtml(result.otherGolfer)+' → '+escapeHtml(result.fromTeam):'')+'</p>':'<p role="alert">'+escapeHtml(result.reason)+'</p>'):'<p>Select a golfer to preview a transfer.</p>';
 return '<section aria-label="Commissioner team transfers" class="eg-transfer">'+
 '<h2>Move or Swap Golfers</h2><p>Preview only. No tournament changes will be saved.</p>'+
 '<label>Change type<select id="eg-transfer-operation"><option value="swap"'+(operation==='swap'?' selected':'')+'>Swap two golfers</option><option value="move"'+(operation==='move'?' selected':'')+'>Move one golfer</option></select></label>'+
 '<label>First golfer<select id="eg-transfer-first">'+options(all,golferIndex)+'</select></label>'+
 (operation==='swap'?'<label>Opposing golfer<select id="eg-transfer-second">'+options(opposite,otherGolferIndex)+'</select></label>':'')+
 summary+'<button type="button" disabled aria-disabled="true">Save changes (not available)</button></section>';
}
module.exports={renderCommissionerTransfer,escapeHtml};
