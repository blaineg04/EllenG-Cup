'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const s=fs.readFileSync('captain.html','utf8');
const pick=s.slice(s.indexOf('let pickInFlight=false;'),s.indexOf('document.getElementById("signin").onclick'));
test('captain cannot submit overlapping pick requests on repeated taps',()=>{
 assert.match(pick,/if\(pickInFlight\)return/);
 assert.match(pick,/pickInFlight=true/);
 assert.match(pick,/querySelectorAll\("\[data-p\]"\).*disabled=true/);
 assert.match(pick,/finally\s*\{\s*pickInFlight=false;\s*render\(\)/);
});
test('pick failure catches refresh failure and eventually restores interaction',()=>{
 assert.match(pick,/try\{await load\(\)\}catch\(refreshError\)/);
 assert.match(pick,/finally\s*\{/);
});

test('realtime render cannot reactivate drafting during an in-flight pick',()=>{
 assert.match(s,/mine=!done&&t===myTeam&&!S\.timerPaused&&!pickInFlight/);
});

test('failed authoritative refresh keeps captain drafting disabled',()=>{
 assert.match(s,/mine=!done&&t===myTeam&&!S\.timerPaused&&!pickInFlight&&!pickSyncFailed/);
 assert.match(pick,/catch\(refreshError\)\{pickSyncFailed=true/);
 assert.match(pick,/Reload this page before drafting again/);
});
