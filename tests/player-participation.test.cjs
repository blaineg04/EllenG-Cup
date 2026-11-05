const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('scoring.html','utf8');
test('new golfer form defaults to Not playing',()=>{assert.match(html,/<select id="newGolferParticipation"><option value="false" selected>Not playing/)});
async function add(playing){
 const fields=new Map();const $=id=>{if(!fields.has(id))fields.set(id,{value:'',textContent:'',disabled:false});return fields.get(id)};
 $('newGolferName').value='Synthetic New';$('newGolferParticipation').value=String(playing);$('newGolferTeam').value='1';
 const state={golfers:[{name:'Existing',team:null}],teams:[{roster:[]},{roster:[]}],picks:[]};let saved;
 const ctx={$: $,isCommissioner:true,ensureDraftShape(){},draftState:state,tournament:{status:"setup"},playerAccounts:[],bandFromHandicapValue(){return ''},isShamblePoints(){return true},draftGolferCount(){return 2},draftTeamSize(){return 100},activeTeamCount(){return 2},TOURNAMENT_ID:'elleng-cup-live',saveDraftState:async()=>{saved=structuredClone(state)},ensureAutomaticPlayerAccounts:async()=>({failed:[]}),renderPlayerEditor(){},isSplitPair(){return false}};
 const start=html.indexOf('$("addGolferBtn").addEventListener("click",async()=>{'),end=html.indexOf('$("savePlayers").addEventListener',start);
 let listener;ctx.$=id=>id==='addGolferBtn'?{addEventListener:(_evt,fn)=>listener=fn}:$(id);vm.runInNewContext(html.slice(start,end),ctx);await listener();return saved;
}
test('adding a nonplayer retains a named golfer/account slot without a team',async()=>{const s=await add(false);assert.equal(s.golfers[1].participating,false);assert.equal(s.golfers[1].team,null);assert.equal(s.golfers[0].name,'Existing')});
test('explicit Playing selection is retained',async()=>{const s=await add(true);assert.equal(s.golfers[1].participating,true);assert.equal(s.golfers[1].team,1)});
test('existing status controls use a scoped server operation rather than removing golfers',()=>{assert.match(html,/async function savePlayerParticipation/);assert.match(html,/db.rpc\("elleng_set_player_participation"/);assert.match(html,/p_expected_updated_at:draftUpdatedAt/);assert.match(html,/data-save-participation/)});
