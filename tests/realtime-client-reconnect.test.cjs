'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('scoring.html','utf8');
test('scoring listens to draft-independent score tables',()=>{
 for(const t of ['elleng_team_scores','elleng_player_hole_scores','elleng_pair_hole_scores','elleng_tournaments'])
  assert.match(html,new RegExp('table:["\\x27]'+t+'["\\x27]'));
});
test('realtime subscription refreshes data and reports channel failure',()=>{
 const block=html.slice(html.indexOf('function subscribeLive(){'),html.indexOf('function setMobileNavVisible('));
 assert.match(block,/liveChannel\.subscribe\(status=>/);
 assert.match(block,/status==="SUBSCRIBED"/);
 assert.match(block,/syncLive\(\)\.catch/);
 for(const state of ['CHANNEL_ERROR','TIMED_OUT','CLOSED'])assert.ok(block.includes(state));
 assert.match(block,/setSyncStatus\("error","Realtime reconnecting"\)/);
});
