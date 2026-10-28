'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../scoring.html'),'utf8');
const start=html.indexOf('$("saveAdmin").addEventListener("click",async()=>{');
const end=html.indexOf('$("reloadAdmin").addEventListener',start);
const body=html.slice(start,end);
test('commissioner checks all three persisted score tables before changing format',()=>{
 assert.ok(start>=0&&end>start,'commissioner save handler found');
 for(const table of ['elleng_team_scores','elleng_pair_hole_scores','elleng_player_hole_scores'])assert.ok(body.includes(table),table);
 assert.match(body,/selectedPlayFormat!==playFormat\(\)\|\|newCount!==oldCount/);
 assert.match(body,/count:"exact",head:true/);
 assert.match(body,/result\.error\|\|!Number\.isInteger\(result\.count\)/);
 assert.match(body,/result\.count>0/);
 assert.ok(body.indexOf('result.count>0')<body.indexOf('draftState.playFormat=selectedPlayFormat'),'must reject before format mutation');
 assert.ok(body.indexOf('result.count>0')<body.indexOf('db.from("elleng_tournaments").update(patch)'),'must reject before database writes');
});
