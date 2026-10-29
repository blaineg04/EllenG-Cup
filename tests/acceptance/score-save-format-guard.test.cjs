'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../scoring.html'),'utf8');
const start=html.indexOf('async function saveScore(teamIndex,val){');
const end=html.indexOf('\nasync function loadBase(',start);
const body=html.slice(start,end);
test('direct team-score write is restricted to standard front-nine scoring',()=>{
 assert.ok(start>=0 && end>start,'score-save function must be present');
 const guard=body.indexOf('if(isSplitPair()||hole<1||hole>9)');
 const firstWrite=body.indexOf('db.from("elleng_team_scores")');
 assert.ok(guard>=0 && firstWrite>guard,'format guard must precede any team score write');
 assert.match(body,/score<1\|\|score>20/);
});
test('dedicated scoring modes use their RPC endpoints',()=>{
 assert.match(html,/db\.rpc\("elleng_test_authorized_split_pair"/);
 assert.match(html,/db\.rpc\("elleng_test_authorized_shamble"/);
});

test('Shamble refuses unassigned golfer before any scoring RPC',()=>{
 const start=html.indexOf('async function savePlayerShambleScore(');
 const end=html.indexOf('function renderPairScoring(',start);
 assert.ok(start>=0&&end>start);
 const body=html.slice(start,end);
 assert.match(body,/if\(isSplitPair\(\)\|\|hole<10\|\|hole>18/);
 assert.match(body,/teamRosterGolfers\(teamIndex\)\.some\(g=>g\.index===golferIndex\)/);
 assert.ok(body.indexOf('teamRosterGolfers(teamIndex).some')<body.indexOf('beginScoreSave()'));
 assert.match(body,/db\.rpc\("elleng_test_authorized_shamble"/);
});
