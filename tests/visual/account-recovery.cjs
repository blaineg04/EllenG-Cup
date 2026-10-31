const{chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const sdk=`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'fixture-owner'}}})}})};`;
(async()=>{let browser;const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+req.url.split('?')[0]);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(p))});await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{browser=await chromium.launch({headless:true});for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:844}});let closed=false,pushFail=true,owner=true,calls=[],lists=0;
 await page.addInitScript(()=>{const original=setInterval;window.setInterval=(fn,ms)=>original(fn,Math.min(ms,60))});
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:sdk}));
 await page.route('https://xepccqedhbucpbwuykoc.supabase.co/functions/v1/reset-requests',r=>{
  const b=r.request().postDataJSON();calls.push(b);if(b.action==='list')lists++;
  if(b.action!=='request'&&!owner)return r.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Commissioner access required.'})});
  if(b.action==='push_status'&&pushFail)return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Push unavailable'})});
  if(b.action==='reset')closed=true;
  const x=b.action==='list'?{requests:closed?[]:[{id:'fixture-id',name:'Bobby Burt',username:'bburt',created_at:new Date().toISOString(),status:'processing',retry_after:new Date(Date.now()-10000).toISOString()}]}:b.action==='request'?{message:'If that username belongs to an EllenG golfer account, your request is now in the commissioner’s reset list.'}:{message:'Password reset. Share the temporary password privately.'};
  return r.fulfill({contentType:'application/json',body:JSON.stringify(x)});
 });
 const base='http://127.0.0.1:'+server.address().port;
 await page.goto(base+'/account-recovery.html');await page.getByLabel('Golfer username').fill('BBURT');await page.getByRole('button',{name:'Request Password Reset',exact:true}).click();await page.locator('#resultText').getByText(/commissioner/).waitFor();assert.equal(calls.find(x=>x.action==='request').username,'bburt');
 await page.goto(base+'/commissioner-reset-requests.html');await page.getByText('Bobby Burt',{exact:true}).waitFor();await page.locator('#pushStatus').getByText(/could not be initialized/).waitFor();assert(await page.locator('#content').isVisible(),'Push failure cannot hide queue');assert(await page.getByRole('button',{name:'Reset Password',exact:true}).isVisible(),'Expired claim retry is visible');
 await page.getByRole('button',{name:'Reset Password',exact:true}).click();await page.getByLabel(/Temporary password/).fill('Fixture password');const before=lists;await page.waitForTimeout(180);assert.equal(lists,before,'Polling pauses while editing');assert.equal(await page.getByLabel(/Temporary password/).inputValue(),'Fixture password');
 await page.getByRole('button',{name:'Confirm Reset',exact:true}).click();await page.getByText('No pending password reset requests.',{exact:true}).waitFor();assert.equal(calls.find(x=>x.action==='reset').id,'fixture-id');assert(!('user_id'in calls.find(x=>x.action==='reset')));
 owner=false;await page.reload();await page.locator('#denied').waitFor({state:'visible'});assert(!await page.locator('#content').isVisible());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');await page.close();
}console.log('PASS: mobile/desktop username request, queue/identity, expired lease retry, push-setup failure isolation, edit-preserving poll, explicit reset and non-owner denial');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});
