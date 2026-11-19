// Offline UI rendering contract for the actual Tournament Extras function.
// No browser, network, authentication, or production tournament data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const points=require('../shamble-points.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../scoring.html'),'utf8');
const start=html.indexOf('function renderPointsExtras(){');
const end=html.indexOf('\nfunction pointScaleText()',start);
assert.ok(start>=0&&end>start,'renderPointsExtras must be present');
const renderCode=html.slice(start,end);
const state={teams:[{name:'Fixture Team A',roster:[0,1]},{name:'Fixture Team B',roster:[2]}],golfers:[{name:'Alpha',team:0},{name:'Beta',team:0},{name:'Gamma',team:1}]};
const pars=Array(18).fill(4);
function check(rows,expected){
 const elements={};
 const $=id=>elements[id]??(elements[id]={value:'all',classList:{toggle(){}}});
 const ctx={$,teams:state.teams,draftState:state,shambleSummary:()=>points.summarize(state,rows,pars,null),teamRosterGolfers:ti=>state.teams[ti].roster.map(index=>({index,name:state.golfers[index].name})),esc:s=>String(s),fmt:n=>String(n)};
 vm.runInNewContext(renderCode+'\nrenderPointsExtras();',ctx,{timeout:1000});
 for(const [id,strings] of Object.entries(expected))for(const str of strings)assert.ok(elements[id]?.innerHTML.includes(str),id+' missing '+str);
}
check([],{postRoundRecap:['Fixture Team A','Fixture Team B','0 pts'],tournamentPulse:['Team pulse will appear'],tournamentAwards:['awards leaders will appear'],paceTracker:['Fixture Team A','Fixture Team B','0/18']});
const row=(golfer_index,team_index,score)=>({golfer_index,team_index,hole:1,score});
check([row(0,0,4),row(1,0,5),row(2,1,3)],{postRoundRecap:['Fixture Team A','5 pts','Fixture Team B','4 pts'],tournamentPulse:['5 Cup pts','4 Cup pts'],tournamentAwards:['Gamma','4 pts'],paceTracker:['Fixture Team A','Fixture Team B','1/18']});
console.log('Offline Tournament Extras render checks passed');
