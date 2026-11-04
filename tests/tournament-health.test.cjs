const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('independent health checker exists',()=>assert.ok(fs.existsSync('scripts/tournament-health.cjs'),'cloud health checker missing'));
const reply=(status,text='')=>({status,ok:status>=200&&status<300,text:async()=>text});
const config={supabaseUrl:'https://xepccqedhbucpbwuykoc.supabase.co',supabasePublishableKey:'public-test'};
test('a temporary failure is retried and successful recovery is healthy',async()=>{
 const {checkHealth}=require('../scripts/tournament-health.cjs');let calls=0;
 const result=await checkHealth({config,sleep:async()=>{},request:async url=>{calls++;if(calls===1)throw Error('network');return reply(200,url.includes('/scoring')?'id="loginBtn" id="playerDirectory" id="saveSelfScore"':url.includes('/functions/')?'': '{}')}});
 assert.equal(result.ok,false); // A score endpoint that allows anonymous requests must fail the authorization probe.
 assert.equal(result.checks.find(c=>c.name==='scoring-page').ok,true);
});
test('upstream failure details and keys never enter monitoring output',async()=>{
 const {checkHealth}=require('../scripts/tournament-health.cjs');
 const r=await checkHealth({config,sleep:async()=>{},request:async()=>{throw Error('secret user-email@example.com '+config.supabasePublishableKey)}});
 const output=JSON.stringify(r);assert.ok(!output.includes('user-email'));assert.ok(!output.includes('public-test'));assert.equal(r.ok,false);
});
test('wrong HTML and provider failures are reported without writing scores',async()=>{
 const {checkHealth}=require('../scripts/tournament-health.cjs');const requests=[];
 const r=await checkHealth({config,sleep:async()=>{},request:async(url,options)=>{requests.push({url,options});return reply(url.includes('/functions/')?401:200,'maintenance page')}});
 assert.equal(r.ok,false);assert.equal(r.checks.find(x=>x.name==='scoring-page').ok,false);
 const posts=requests.filter(x=>x.options.method==='POST');assert.ok(posts.length);assert.ok(posts.every(x=>x.options.body==='{}'&&!x.options.headers.Authorization));
});
test('expected app content, database response and guarded scoring endpoint are healthy',async()=>{
 const {checkHealth}=require('../scripts/tournament-health.cjs');
 const r=await checkHealth({config,sleep:async()=>{},request:async url=>reply(url.includes('/functions/')?401:200,url.includes('/scoring')?'id="loginBtn" id="playerDirectory" id="saveSelfScore"':'{}')});assert.equal(r.ok,true);
});
