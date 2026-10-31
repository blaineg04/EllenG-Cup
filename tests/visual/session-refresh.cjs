const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {installFixture}=require('./shamble-fixture.cjs');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,full=path.resolve(root,'.'+p);if(!full.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);return res.end()}res.setHeader('Content-Type',full.endsWith('.js')?'text/javascript':full.endsWith('.html')?'text/html':'application/octet-stream');res.end(data)})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.ELLENG_CHROMIUM_PATH?{executablePath:process.env.ELLENG_CHROMIUM_PATH,args:['--no-sandbox']}:{})});

 try{for(const role of ['commissioner','captain','player'])for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:850},serviceWorkers:'block'});page.setDefaultTimeout(8000);
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'text/javascript',body:'('+installFixture.toString().replace("let signedOut=role==='signedout'", "let signedOut=role==='signedout'||localStorage.getItem('fixture-signed-out')==='1'").replace('signedOut=true;return',"signedOut=true;localStorage.setItem('fixture-signed-out','1');return")+')('+JSON.stringify({teamCount:2,role})+');'});if(u.origin===origin)return route.continue();return route.abort()});
 await page.addInitScript(()=>{const original=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>original(typeof fn==='function'&&fn.name==='goHome'&&delay===450?()=>{fn(...args);window.__playerLandingGuardComplete=true}:fn,delay,...args)});
 // Direct URL and refresh have no internal-menu flag or #hub hint.
 await page.goto(origin+'/scoring.html');
 await page.locator('#appHub:not(.hidden)').waitFor();
 for(let refresh=0;refresh<2;refresh++){
   await page.locator('#hubScoring').click();
   await page.locator('#appHub').waitFor({state:'hidden'});
   await page.reload();
   await page.locator('#appHub:not(.hidden)').waitFor();
   assert.equal(await page.locator('#loginCard').isVisible(),false,'Active session must not require login after refresh');
 }
 await page.locator('#hubSignOutBtn').click();
 await page.locator('#loginCard').waitFor({state:'visible'});
 await page.reload();
 await page.locator('#loginCard').waitFor({state:'visible'});
 assert.equal(await page.locator('#appHub').isVisible(),false,'Explicit sign-out must survive refresh');
 console.log('PASS saved session refresh and persistent sign-out',role,width);await page.close();
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
