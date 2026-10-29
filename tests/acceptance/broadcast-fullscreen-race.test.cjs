'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../../scoring.html'),'utf8');
test('Broadcast handles close before asynchronous fullscreen entry settles',()=>{
 const start=html.indexOf('async function openBroadcastMode()');
 const end=html.indexOf('async function closeBroadcastMode()',start);
 assert.ok(start>=0&&end>start);
 const body=html.slice(start,end);
 assert.match(body,/await ov\.requestFullscreen\?\.\(\)/);
 assert.match(body,/finally\s*\{/);
 assert.match(body,/!ov\.classList\.contains\("open"\)/);
 assert.match(body,/document\.fullscreenElement===ov/);
 assert.match(body,/await document\.exitFullscreen\(\)/);
});
