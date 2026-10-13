const test=require('node:test');
const assert=require('node:assert/strict');
const {review,snapshot}=require('../quota-approval.js');
const players=[{id:'a',band:'A'},{id:'b',band:'B'},{id:'c',band:'C'},{id:'d',band:'D'}];
const quotas={A:23,B:20,C:16,D:10};
test('assigns band quotas to all golfers',()=>{
 const r=review(players,quotas);
 assert.equal(r.ok,true);
 assert.deepEqual(r.players.map(p=>p.quota),[23,20,16,10]);
 assert.equal(r.overrides,0);
});
test('individual override takes precedence without changing other players',()=>{
 const r=review(players,quotas,{c:13});
 assert.equal(r.ok,true);
 assert.deepEqual(r.players.map(p=>p.quota),[23,20,13,10]);
 assert.equal(r.players[2].source,'override');
 assert.equal(r.overrides,1);
});
test('zero quota override is supported but negative quota is rejected',()=>{
 assert.equal(review(players,quotas,{d:0}).ok,true);
 assert.equal(review(players,quotas,{d:-1}).ok,false);
});
test('duplicate player identifiers rejected',()=>{
 assert.equal(review([...players,{id:'a',band:'D'}],quotas).ok,false);
});
test('missing and unknown classifications rejected',()=>{
 assert.equal(review([{id:'x',band:'E'}],quotas).ok,false);
 assert.equal(review(players,{A:23,B:20,C:16}).ok,false);
});
test('override for absent player rejected',()=>{
 assert.equal(review(players,quotas,{ghost:10}).ok,false);
});
test('draft snapshot is detached from player inputs and never marked approved',()=>{
 const s=snapshot(players,quotas,{a:21});
 assert.equal(s.ok,true);
 assert.equal(s.status,'draft');
 assert.equal(s.approvedAt,null);
 assert.equal(s.players[0].quota,21);
 players[0].band='D';
 assert.equal(s.players[0].band,'A');
 players[0].band='A';
});
