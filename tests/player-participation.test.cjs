const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('scoring.html','utf8');
test('new golfer form defaults to Not playing',()=>{assert.match(html,/<select id="newGolferParticipation"><option value="false" selected>Not playing/)});
async function add(playing,accounts=[],existingCount=1){
 const fields=new Map();const $=id=>{if(!fields.has(id))fields.set(id,{value:'',textContent:'',disabled:false});return fields.get(id)};
 $('newGolferName').value='Synthetic New';$('newGolferParticipation').value=String(playing);$('newGolferTeam').value='1';
 const state={golfers:Array.from({length:existingCount},(_,i)=>({name:i?'Existing '+i:'Existing',team:null,participating:i===0})),teams:[{roster:[]},{roster:[]}],picks:[]};let saved;
 const ctx={structuredClone,$: $,isCommissioner:true,ensureDraftShape(){},draftState:state,tournament:{status:"setup"},playerAccounts:accounts,bandFromHandicapValue(){return ''},isShamblePoints(){return true},draftGolferCount(){return 2},draftTeamSize(){return 4},activeTeamCount(){return 2},DRAFT_ID:'elleng-cup',draftUpdatedAt:'2026-11-05',TOURNAMENT_ID:'elleng-cup-live',db:{rpc:async()=>{saved=structuredClone(state);return {error:null}}},loadBase:async()=>{},renderAll(){},saveDraftState:async()=>{saved=structuredClone(state)},ensureAutomaticPlayerAccounts:async()=>({failed:[]}),renderPlayerEditor(){},isSplitPair(){return false}};
 const start=html.indexOf('$("addGolferBtn").addEventListener("click",async()=>{'),end=html.indexOf('$("savePlayers").addEventListener',start);
 let listener;ctx.$=id=>id==='addGolferBtn'?{addEventListener:(_evt,fn)=>listener=fn}:$(id);vm.runInNewContext(html.slice(start,end),ctx);await listener();return saved;
}
test('adding a nonplayer retains a named golfer/account slot without a team',async()=>{const s=await add(false);assert.equal(s.golfers[1].participating,false);assert.equal(s.golfers[1].team,null);assert.equal(s.golfers[0].name,'Existing')});
test('explicit Playing selection is retained',async()=>{const s=await add(true);assert.equal(s.golfers[1].participating,true);assert.equal(s.golfers[1].team,1)});
test('existing status controls use a scoped server operation rather than removing golfers',()=>{assert.match(html,/async function savePlayerParticipation/);assert.match(html,/db.rpc\("elleng_set_player_participation"/);assert.match(html,/p_expected_updated_at:draftUpdatedAt/);assert.match(html,/data-save-participation/)});

test("new golfer never occupies an account-only registered index",async()=>{const s=await add(false,[{golfer_index:1,user_id:"reserved"}]);assert.equal(s.golfers[1].name,"");assert.equal(s.golfers[2].name,"Synthetic New")});
test("inactive slots do not expand two-team shamble",async()=>{const s=await add(true,[],40);assert.equal(s.golfers[40].participating,true);assert.equal(s.teams.length,2)});

test('nonplayers cannot be assigned through player editor and scoring excludes stale roster membership',()=>{
 assert.ok(html.includes('g.participating===false?"disabled":""'));
 assert.ok(html.includes('team:g.participating===false?null:'));
 const code=html.slice(html.indexOf('function teamRosterGolfers('),html.indexOf('function validStoredPlayerScore('));
 const c={draftState:{golfers:[{name:'Excluded',participating:false}],teams:[{roster:[0]}]},teams:[{roster:[0]}]};
 vm.runInNewContext(code,c);assert.equal(c.teamRosterGolfers(0).length,0);
});
