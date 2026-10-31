const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('push events always show a visible notification and notification clicks cannot redirect externally',async()=>{
 const handlers={},shown=[],opened=[];const self={location:{origin:'https://elleng-cup.vercel.app'},addEventListener:(n,f)=>handlers[n]=f,registration:{showNotification:async(...x)=>shown.push(x)},clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../service-worker.js'),'utf8'),{self,URL});
 let task;handlers.push({data:{json:()=>({title:'Reset request',body:'bburt',url:'https://evil.invalid'})},waitUntil:p=>task=p});await task;assert.equal(shown[0][0],'Reset request');assert.equal(shown[0][1].body,'bburt');
 handlers.notificationclick({notification:{close:()=>{},data:{url:'https://evil.invalid'}},waitUntil:p=>task=p});await task;assert.deepEqual(opened,['https://elleng-cup.vercel.app/commissioner-reset-requests']);
 handlers.push({data:{json:()=>{throw Error('malformed')}},waitUntil:p=>task=p});await task;assert.equal(shown[1][0],'EllenG Cup');
});
