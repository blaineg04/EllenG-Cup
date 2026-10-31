const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {installFixture}=require('./shamble-fixture.cjs');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,full=path.resolve(root,'.'+p);if(!full.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);return res.end()}res.setHeader('Content-Type',full.endsWith('.js')?'text/javascript':full.endsWith('.html')?'text/html':'application/octet-stream');res.end(data)})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});

 try{for(const role of ['commissioner','captain','player'])for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:850},serviceWorkers:'block'});page.setDefaultTimeout(8000);
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'text/javascript',body:'('+installFixture.toString()+')('+JSON.stringify({teamCount:2,role})+');'});if(u.origin===origin)return route.continue();return route.abort()});
 await page.addInitScript(()=>{const original=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>original(typeof fn==='function'&&fn.name==='goHome'&&delay===450?()=>{fn(...args);window.__playerLandingGuardComplete=true}:fn,delay,...args)});
 await page.goto(origin+'/scoring.html#hub');await page.locator('#hubScoring').click();await page.locator('#appHub').waitFor({state:'hidden'});if(role==='player')await page.waitForFunction(()=>window.__playerLandingGuardComplete===true);
 await page.locator(width<700?'[data-mobile-view="leaderboard"]':'.tab[data-view="leaderboard"]').click();
 await page.locator('#leaderboard').getByText('12 pts',{exact:true}).first().waitFor();assert.equal(await page.locator('#leaderboard .pts').allTextContents().then(x=>x.join(',')),'12 pts,12 pts');
 assert.match(await page.locator('#selfScoreContext').innerText(),/18-hole Shamble/);
 await page.locator('#selfScoreHole').selectOption('18');await page.locator('#selfScoreInput').fill('3');await page.locator('#saveSelfScore').click();await page.locator('#selfScoreMsg').getByText(/Saved/).waitFor();
 assert.match(await page.locator('#selfScoreTerm').innerText(),/4 pts/);assert((await page.locator('#leaderboard .pts').allTextContents()).includes('16 pts'));
 await page.locator('#clearSelfScore').click();await page.locator('#selfScoreMsg').getByText(/cleared/).waitFor();assert.equal(await page.locator('#leaderboard .pts').allTextContents().then(x=>x.join(',')),'12 pts,12 pts');
 console.log('PASS all18 individual points, team sum, clear',role,width);await page.close();
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
