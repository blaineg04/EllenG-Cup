const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('tournament update policy is available',()=>assert.ok(fs.existsSync('tournament-update-policy.js'),'update freeze policy missing'));
test('live play and pending work prevent reload, idle setup allows explicit refresh',()=>{
 const {canRefresh}=require('../tournament-update-policy.js');
 for(const state of [{live:true},{saving:true},{pending:1},{editing:true},{online:false}])assert.equal(canRefresh({online:true,...state}),false);
 assert.equal(canRefresh({online:true,live:false,saving:false,pending:0,editing:false}),true);
});
