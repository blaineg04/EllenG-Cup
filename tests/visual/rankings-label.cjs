const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {installFixture}=require('./shamble-fixture.cjs');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,full=path.resolve(root,'.'+p);if(!full.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);return res.end()}res.setHeader('Content-Type',full.endsWith('.js')?'text/javascript':full.endsWith('.html')?'text/html':'application/octet-stream');res.end(data)})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.ELLENG_CHROMIUM_PATH?{executablePath:process.env.ELLENG_CHROMIUM_PATH,args:['--no-sandbox']}:{})});

 try{for(const role of ['commissioner'])for(const width of [320,375,390,430,1440]){
 const page=await browser.newPage({viewport:{width,height:850},serviceWorkers:'block'});page.setDefaultTimeout(8000);
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'text/javascript',body:'('+installFixture.toString().replace("band: ['A', 'B', 'C', 'D'][i % 4]", "band: '—'")+')('+JSON.stringify({teamCount:2,role})+');'});if(u.origin===origin)return route.continue();return route.abort()});
 await page.addInitScript(()=>{const original=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>original(typeof fn==='function'&&fn.name==='goHome'&&delay===450?()=>{fn(...args);window.__playerLandingGuardComplete=true}:fn,delay,...args)});
 await page.goto(origin+'/scoring.html#hub');await page.locator('#hubScoring').click();await page.locator('#appHub').waitFor({state:'hidden'});if(role==='player')await page.waitForFunction(()=>window.__playerLandingGuardComplete===true);
 await page.locator('[data-more-view="rankings"]').evaluate(e=>e.click());
 await page.locator('.ranking-band-compact-head strong').getByText('Unranked',{exact:true}).waitFor();
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('.ranking-band-compact-head')].filter(head=>{
   const label=head.querySelector('strong'),range=document.createRange();range.selectNodeContents(label);
   return range.getBoundingClientRect().right>head.getBoundingClientRect().right-2;
 }).map(e=>e.innerText));
 assert.deepEqual(overflow,[],'Ranking labels must fit before the column divider');
 if(width===390)await page.screenshot({path:'/tmp/elleng-rankings.png'});
 console.log('PASS ranking label containment',role,width);await page.close();
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
