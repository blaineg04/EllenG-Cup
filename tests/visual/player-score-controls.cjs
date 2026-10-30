const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {installFixture}=require('./fixture.cjs');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname,full=path.resolve(root,'.'+p);if(!full.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);return res.end()}res.setHeader('Content-Type',full.endsWith('.js')?'text/javascript':full.endsWith('.html')?'text/html':'application/octet-stream');res.end(data)})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{for(const file of ['scoring.html','player-scoring-test.html'])for(const width of [320,375,390,1440]){
  const page=await browser.newPage({viewport:{width,height:740},serviceWorkers:'block'});page.setDefaultTimeout(6000);
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js'))return route.fulfill({contentType:'text/javascript',body:'('+installFixture.toString()+')({teamCount:2,role:"player"});'});if(u.origin===origin)return route.continue();return route.abort()});
  await page.goto(origin+'/'+file+'#hub');await page.locator('#hubScoring').click();await page.locator('#appHub').waitFor({state:'hidden'});
  await page.locator(width<700?'[data-mobile-view="leaderboard"]':'.tab[data-view="leaderboard"]').click();
  await page.evaluate(()=>{document.getElementById('selfScoreMsg').textContent='Saved your Pair 1 score for Hole 1: 18 strokes (+14 • +14 Over Par).';});
  for(const id of ['saveSelfScore','clearSelfScore']){
   const button=page.locator('#'+id);await button.click({trial:true});
   const result=await button.evaluate(el=>{const a=el.getBoundingClientRect(),hit=document.elementFromPoint(a.left+a.width/2,a.top+a.height/2),clipped=[];for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();if(/hidden|clip/.test(s.overflowY)&&(a.top<b.top-1||a.bottom>b.bottom+1))clipped.push(p.id||p.className)}return {height:a.height,hit:el===hit||el.contains(hit),clipped}});
   assert(result.hit&&result.height>=27&&result.clipped.length===0,JSON.stringify({file,width,id,...result}));
  }
  console.log('PASS reachable Save/Clear with long status',file,width);await page.close();
 }}finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
