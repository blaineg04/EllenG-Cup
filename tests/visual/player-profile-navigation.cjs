const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {installFixture}=require('./fixture.cjs');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,full=path.resolve(root,'.'+p);if(!full.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);return res.end()}res.setHeader('Content-Type',full.endsWith('.js')?'text/javascript':full.endsWith('.html')?'text/html':'application/octet-stream');res.end(data)})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});

 try{for(const role of ['commissioner','captain','player'])for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:800},serviceWorkers:'block'});
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'text/javascript',body:'('+installFixture.toString()+')('+JSON.stringify({teamCount:9,role})+');'});if(u.origin===origin)return route.continue();return route.abort()});
 await page.addInitScript(()=>{const original=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>original(typeof fn==='function'&&fn.name==='goHome'&&delay===450?()=>{fn(...args);window.__playerLandingGuardComplete=true}:fn,delay,...args)});
 await page.goto(origin+'/scoring.html#hub');await page.locator('#hubScoring').click();await page.locator('#appHub').waitFor({state:'hidden'});if(role==='player')await page.waitForFunction(()=>window.__playerLandingGuardComplete===true);
 await page.locator(width<700?'[data-mobile-view="players"]':'.tab[data-view="players"]').click();
 await page.locator('[data-player-profile]').first().click();
 const profile=page.locator('#playerProfileCardsSection');
 const result=await profile.evaluate(el=>{const r=el.getBoundingClientRect();return {visible:!el.classList.contains('hidden'),top:r.top,bottom:r.bottom,height:r.height,viewport:innerHeight,directory:getComputedStyle(document.querySelector('#playersView > .card:first-child')).display}});
 console.log('PROFILE',role,width,JSON.stringify(result));assert.equal(result.directory,'none','Opening a profile must replace the directory for every role');assert(result.visible&&result.top>=0&&result.top<result.viewport-100,'Profile must be visible immediately');
 await page.locator('#closePlayerProfile').click();assert(await profile.evaluate(el=>el.classList.contains('hidden')));assert(await page.locator('[data-player-profile]').first().isVisible());console.log('PASS profile open and close',role,width);await page.close();
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
