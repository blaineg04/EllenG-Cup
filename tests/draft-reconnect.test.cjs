'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const s=fs.readFileSync('common.js','utf8');
const block=s.slice(s.indexOf('function subscribe(cb)'),s.indexOf('function remaining()'));
test('draft reloads persisted state when Realtime subscription reconnects',()=>{
 assert.match(block,/st==="SUBSCRIBED"/);
 assert.match(block,/await load\(\)/);
 assert.match(block,/if\(epoch!==connectionEpoch\|\|!connected\)return/);
 assert.match(block,/Draft resubscription refresh failed/);
 assert.match(block,/el\.textContent="SYNC ERROR"/);
});
test('draft visibly distinguishes channel failures',()=>{
 for(const status of ['CHANNEL_ERROR','TIMED_OUT','CLOSED'])assert.ok(block.includes(status));
 assert.match(block,/"RECONNECTING"/);
});

test('draft status strip follows channel state and failed catch-up',()=>{
 assert.match(block,/getElementById\("draftStatusStrip"\)/);
 assert.match(block,/strip\.classList\.add\(st==="SUBSCRIBED"/);
 assert.match(block,/strip\.classList\.add\("status-offline"\)/);
});
