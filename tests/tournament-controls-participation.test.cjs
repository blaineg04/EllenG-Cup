const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const html=fs.readFileSync(require('node:path').join(__dirname,'../scoring.html'),'utf8');
const code=html.slice(html.indexOf('$("saveAdmin").addEventListener("click",async()=>{'),html.indexOf('$("reloadAdmin").addEventListener'));
async function save(desired=22){
 const golfers=Array.from({length:70},(_,i)=>({name:i<22||i>=53?`Golfer ${i}`:'',participating:i<22,team:null}));
 const original=JSON.stringify(golfers),els={},writes=[];let handler,persisted;
 const values={pointsGolferCount:desired,playFormatSelect:'shamble_points',teamCountSelect:'2',teamSizeSelect:'4',courseSelect:'new-course',courseRouteSelect:'route',statusSelect:'setup',gatorReveal:'false'};
 const ctx={isCommissioner:true,draftState:{golfers,teams:[{roster:[]},{roster:[]}],picks:[],playFormat:'shamble_points'},$:id=>els[id]??=( {value:values[id]??'',addEventListener:(_,fn)=>{if(id==='saveAdmin')handler=fn}}),activeTeamCount:()=>2,ensureDraftShape:()=>{},draftGolferCount:()=>22,draftTeamSize:()=>4,playFormat:()=> 'shamble_points',COURSE_LIBRARY:{'new-course':{routes:{route:{par:Array(18).fill(4)}}}},TOURNAMENT_ID:'test',DRAFT_ID:'test',db:{from:table=>({update:patch=>{writes.push({table,patch});return {eq:()=>({select:()=>({single:async()=>({data:patch})})})}}})},rebuildTeamRosters:()=>{},saveDraftState:async()=>{persisted=JSON.parse(JSON.stringify(ctx.draftState))},loadBase:async()=>{},loadScores:async()=>{},renderAll:()=>{},isShamblePoints:()=>true,teams:[{},{}]};
 vm.runInNewContext(code,ctx);await handler();return {ctx,els,writes,persisted,original};
}
test('39 named accounts with 22 playing can save course and pars without changing any golfer index',async()=>{
 const r=await save();assert.ok(r.persisted,r.els.adminMsg.textContent);assert.equal(r.persisted.courseId,'new-course');assert.equal(r.persisted.golferCount,22);assert.equal(JSON.stringify(r.persisted.golfers),r.original);assert.deepEqual(Array.from(r.writes[0].patch.hole_pars),Array(18).fill(4));assert.match(r.els.adminMsg.textContent,/saved/);
});
test('cannot lower tournament size below playing roster',async()=>{const r=await save(21);assert.equal(r.persisted,undefined);assert.equal(r.writes.length,0);assert.match(r.els.adminMsg.textContent,/22.*playing/);assert.equal(JSON.stringify(r.ctx.draftState.golfers),r.original)});
