const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {installFixture}=require('./fixture.cjs');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,full=path.resolve(root,'.'+p);if(!full.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);return res.end()}res.setHeader('Content-Type',full.endsWith('.js')?'text/javascript':full.endsWith('.html')?'text/html':'application/octet-stream');res.end(data)})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{for(const file of ['scoring.html','player-scoring-test.html'])for(const [width,height] of [[320,568],[375,667],[390,740],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'});page.setDefaultTimeout(6000);
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'text/javascript',body:'('+installFixture.toString()+')({teamCount:2,role:"player"});'});if(u.origin===origin)return route.continue();return route.abort()});
  // Observe completion of the app's existing delayed Home landing guard before testing another view.
  await page.addInitScript(()=>{const original=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>original(typeof fn==='function'&&fn.name==='goHome'&&delay===450?()=>{fn(...args);window.__playerLandingGuardComplete=true}:fn,delay,...args)});
  await page.goto(origin+'/'+file+'#hub');await page.locator('#hubScoring').click();await page.locator('#appHub').waitFor({state:'hidden'});await page.waitForFunction(()=>window.__playerLandingGuardComplete===true);
  await page.locator(width<700?'[data-mobile-view="leaderboard"]':'.tab[data-view="leaderboard"]').click();
  await page.evaluate(()=>{document.getElementById('selfScoreMsg').textContent='Saved your Pair 1 score for Hole 1: 18 strokes (+14 • +14 Over Par).';});
  const scrolling=await page.locator('#leaderboardView').evaluate(el=>{el.scrollTop=el.scrollHeight;return {overflow:getComputedStyle(el).overflowY,needed:el.scrollHeight>el.clientHeight+1,scrolled:el.scrollTop>0}});assert.equal(scrolling.overflow,'auto');assert(!scrolling.needed||scrolling.scrolled);
  const constraints=await page.locator('#myScoreEntryCard').evaluate(el=>({maxHeight:getComputedStyle(el).maxHeight,flexBasis:getComputedStyle(el).flexBasis}));
  assert.equal(constraints.maxHeight,'none','Score entry must not have a fixed height cap that clips controls');
  assert.equal(constraints.flexBasis,'auto');
  for(const id of ['saveSelfScore','clearSelfScore']){
   const button=page.locator('#'+id);try{await button.click({trial:true})}catch(error){console.log('CONTROL_DIAGNOSTIC',JSON.stringify(await button.evaluate(el=>{const rows=[];for(let p=el;p;p=p.parentElement){const r=p.getBoundingClientRect(),s=getComputedStyle(p);rows.push({id:p.id,tag:p.tagName,cls:p.className,display:s.display,visibility:s.visibility,overflow:s.overflowY,scroll:p.scrollTop,h:r.height,top:r.top,bottom:r.bottom})}return rows})));throw error}
   const result=await button.evaluate(el=>{const a=el.getBoundingClientRect(),hit=document.elementFromPoint(a.left+a.width/2,a.top+a.height/2),clipped=[];for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/hidden|clip/.test(s.overflowY)&&(a.top<b.top-1||a.bottom>b.bottom+1))clipped.push(p.id||p.className)}return {height:a.height,hit:el===hit||el.contains(hit),clipped}});
   assert(result.hit&&result.height>=27&&result.clipped.length===0,JSON.stringify({file,width,id,...result}));
  }
  console.log('PASS reachable Save/Clear with long status',file,width);await page.close();
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
