'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('common.js','utf8');
const start=source.indexOf('function remaining()');
const end=source.indexOf('function esc(',start);
assert.ok(start!==-1&&end>start,'shared timer implementation present');
const timerSource=source.slice(start,end);
function clock(state,now){
 const ctx={S:state,Date:class extends Date{static now(){return now}}};
 vm.createContext(ctx);
 vm.runInContext(timerSource+';this.read=remaining',ctx);
 return ctx.read();
}
test('paused draft uses saved timer length, regardless of wall clock',()=>{
 assert.equal(clock({timerPaused:true,timerLength:60,timerEndsAt:'2026-10-22T00:00:00Z'},Date.parse('2026-10-22T01:00:00Z')),60);
});
test('running draft uses a fixed absolute deadline across reconnects',()=>{
 const deadline='2026-10-22T12:00:30Z';
 assert.equal(clock({timerPaused:false,timerLength:60,timerEndsAt:deadline},Date.parse('2026-10-22T12:00:00Z')),30);
 assert.equal(clock({timerPaused:false,timerLength:60,timerEndsAt:deadline},Date.parse('2026-10-22T12:00:17Z')),13);
});
test('expired draft timer cannot display negative seconds',()=>{
 assert.equal(clock({timerPaused:false,timerLength:60,timerEndsAt:'2026-10-22T12:00:00Z'},Date.parse('2026-10-22T12:01:00Z')),0);
});

test('timer on separate simulated clients derives identical remaining seconds',()=>{
 const state={timerPaused:false,timerLength:60,timerEndsAt:'2026-10-22T12:00:45Z'};
 const now=Date.parse('2026-10-22T12:00:20Z');
 assert.equal(clock(structuredClone(state),now),clock(structuredClone(state),now));
 assert.equal(clock(state,now),25);
});
test('clock only resumes from the saved deadline when unpaused',()=>{
 const now=Date.parse('2026-10-22T12:00:30Z');
 const state={timerPaused:true,timerLength:40,timerEndsAt:'2026-10-22T12:00:45Z'};
 assert.equal(clock(state,now),40);
 assert.equal(clock({...state,timerPaused:false},now),15);
});
