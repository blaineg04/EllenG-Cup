const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { installFixture } = require('./fixture.cjs');
const WIDTHS = [320, 375, 390, 430, 1024, 1440, 1920];
const PREVIEWS = new Set(['elleng-i6xsd5b3j-blaineg04-3428.vercel.app','elleng-cup-git-release-nov20-score-integr-97dac7-blaineg04-3428.vercel.app']);
const root = path.resolve(__dirname, '../..');

function previewURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !PREVIEWS.has(url.hostname) || url.port || url.username || url.password || url.search || url.hash) {
    throw new Error('Use a verified immutable EllenG Cup preview origin from PREVIEWS; production and arbitrary URLs are rejected.');
  }
  return url.origin;
}
function previewRequestAllowed(request, allowSignIn = false) {
  if(['GET','HEAD','OPTIONS'].includes(request.method()))return true;
  const url=new URL(request.url());
  if(url.hostname!=='xepccqedhbucpbwuykoc.supabase.co')return false;
  if(url.pathname==='/auth/v1/token'&&(url.searchParams.get('grant_type')==='refresh_token'||(allowSignIn&&url.searchParams.get('grant_type')==='password')))return true;
  let body;try{body=request.postDataJSON();}catch{return false;}
  if(!body||body.draft_id!=='elleng-cup')return false;
  if(url.pathname==='/functions/v1/player-profile')return Object.keys(body).length===1;
  return url.pathname==='/functions/v1/player-admin'&&body.action==='list'&&Object.keys(body).every(k=>['draft_id','action'].includes(k));
}
function auditDOM() {
  const scope=document.querySelector('#broadcastOverlay.open')||document.querySelector('#moreMenuBackdrop.open .more-sheet')||document.querySelector('#appHub:not(.hidden)')||document.querySelector('body.extras-screen-active #extrasView:not(.hidden)')||document;
  const label = e => e.id ? `#${e.id}` : `${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).join('.')}: ${(e.textContent || '').trim().slice(0,70)}`;
  const visible = e => { const r=e.getBoundingClientRect(),s=getComputedStyle(e);const closed=e.closest('details:not([open])');if(closed&&!closed.querySelector('summary')?.contains(e))return false;if(s.opacity==='0')return false;return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&e.getClientRects().length>0; };
  const clipped = [], overlaps = [], outside = [], fixedNavOcclusions = [];
  const controls = [...scope.querySelectorAll('button,a,input,select,textarea')].filter(visible);
  for (const e of controls) {
    const r=e.getBoundingClientRect();
    let scroller=false;
    for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(/auto|scroll/.test(s.overflowX)&&p.scrollWidth>p.clientWidth)scroller=true;}
    if(!scroller&&(r.left < -2 || r.right > innerWidth+2)) outside.push(label(e));
  }
  for (const e of scope.querySelectorAll('button,a,strong,h1,h2,h3,label,small,.status,.note')) {
    if(!visible(e))continue;
    const s=getComputedStyle(e);
    if(e.clientWidth>0&&e.scrollWidth>e.clientWidth+3&&/hidden|clip/.test(s.overflowX)&&s.textOverflow!=='ellipsis')clipped.push(label(e));
  }
  const onScreen=controls.filter(e=>{const r=e.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.left<innerWidth&&r.right>0;});
  for(let i=0;i<onScreen.length;i++)for(let j=i+1;j<onScreen.length;j++){
    const a=onScreen[i],b=onScreen[j];if(a.contains(b)||b.contains(a))continue;
    const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();
    if((a.closest('#mobileBottomNav')||b.closest('#mobileBottomNav'))){const e=a.closest('#mobileBottomNav')?b:a;if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>4&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>4&&e.id)fixedNavOcclusions.push('#'+e.id);continue;}
    if(Math.min(x.right,y.right)-Math.max(x.left,y.left)>4&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>4)overlaps.push([label(a),label(b)]);
  }
  return {auditedRoot:scope.id||'document',viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth,
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2, outsideControls:outside, clippedText:clipped, overlappingControls:overlaps, fixedNavOcclusions:[...new Set(fixedNavOcclusions)]};
}
async function serve() {
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    let file=decodeURIComponent(url.pathname);if(file==='/')file='/index.html';
    if(!path.extname(file))file+='.html';
    const full=path.resolve(root,'.'+file);
    if(!full.startsWith(root+path.sep)||file.split('/').some(x=>x.startsWith('.'))){res.writeHead(403);res.end();return;}
    fs.readFile(full,(err,data)=>{if(err){res.writeHead(404);res.end();return;}const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.wav':'audio/wav'};res.setHeader('Content-Type',types[path.extname(full)]||'application/octet-stream');res.end(data);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,origin:`http://127.0.0.1:${server.address().port}`};
}
// Exercise visible controls, never force clicks or invoke handlers directly.
async function verifyNavigation(page, width, capture, prefix = '') {
  const mobile = width < 700;
  const home = mobile ? '[data-mobile-view="home"]' : '.tab[data-view="home"]';
  const more = mobile ? '#mobileMoreBtn' : '#desktopMoreBtn';
  const openMore = async () => {
    await page.locator(more).click();
    await page.locator('#moreMenuBackdrop.open').waitFor({state:'visible'});
  };
  await page.locator(home).click();
  await openMore();
  await capture(prefix+'more-menu');
  const unreadable = await page.locator('.more-sheet-head h3, #moreAdminBtn:not(.hidden) strong').evaluateAll(elements => {
    const luminance = rgb => {
      const linear = rgb.map(v => {v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});
      return linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
    };
    return elements.filter(e => {
      const rgb=getComputedStyle(e).color.match(/[\d.]+/g).slice(0,3).map(Number);
      // Check against the darkest endpoint of the light menu surfaces.
      const a=luminance(rgb),b=luminance([247,242,232]);
      return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)<4.5;
    }).map(e=>e.textContent.trim());
  });
  if(unreadable.length)throw new Error('More menu text lacks contrast: '+unreadable.join(', '));
  await page.locator('#moreMenuClose').click();
  await page.locator('#moreMenuBackdrop').waitFor({state:'hidden'});
  if(mobile){await openMore();await page.locator('[data-more-view="course"]').click();}
  else await page.locator('.tab[data-view="course"]').click();
  await page.locator('#courseView:not(.hidden)').waitFor({state:'visible'});
  await openMore();
  await page.locator('[data-more-view="rankings"]').click();
  await page.locator('#rankingsView:not(.hidden)').waitFor({state:'visible'});
  await page.locator('#moreMenuBackdrop').waitFor({state:'hidden'});
  await openMore();
  await page.locator('#openBroadcast').click();
  await page.locator('#broadcastOverlay.open').waitFor({state:'visible'});
  await page.locator('#closeBroadcast').click();
  await page.locator('#broadcastOverlay').waitFor({state:'hidden'});
  await page.locator(home).click();
  await page.locator('#homeView:not(.hidden)').waitFor({state:'visible'});
  console.log(`${width} ${prefix}real navigation: Course, Rankings, Broadcast and return Home passed`);
}
async function main() {
  const live=!!process.env.ELLENG_PREVIEW_URL;
  if(live&&process.env.CI)throw new Error('Live preview screenshots/session files must remain local; public CI runs fixtures only.');
  const storage=process.env.ELLENG_VISUAL_STORAGE_STATE;
  if(live&&(!storage||!fs.existsSync(storage)))throw new Error('Preview mode needs an existing local signed-in storage-state file; never put credentials in the repository.');
  const host=live?{origin:previewURL(process.env.ELLENG_PREVIEW_URL)}:await serve();
  const output=path.resolve(process.env.ELLENG_VISUAL_OUTPUT||path.join(root,'visual-results'));
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  let browser;
  const report={mode:live?'authenticated-preview':'isolated-fixture',widths:WIDTHS,checks:[],errors:[],blockedWrites:0};
  try {
    browser=await chromium.launch({headless:true,...(process.env.ELLENG_CHROMIUM_PATH?{executablePath:process.env.ELLENG_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
    report.browserVersion=browser.version();
    for(const width of WIDTHS){
      if(process.env.ELLENG_CHROMIUM_PATH && width!==WIDTHS[0]){await browser.close();browser=await chromium.launch({headless:true,executablePath:process.env.ELLENG_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});}
      const context=await browser.newContext({viewport:{width,height:width<700?812:1080},deviceScaleFactor:1,serviceWorkers:'block',...(live?{storageState:storage}: {})});
      const page=await context.newPage();page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(15000);
      page.on('pageerror',e=>report.errors.push({width,message:e.message}));
      if(!live){
        await context.addInitScript(()=>{if(new URL(location.href).searchParams.has('visualSignedOut'))sessionStorage.removeItem('elleng_internal_menu');else sessionStorage.setItem('elleng_internal_menu','1');});
        await context.route('**/*',async route=>{
          const url=new URL(route.request().url());
          if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('supabase-js')){const current=new URL(route.request().frame().url());return route.fulfill({contentType:'text/javascript',body:`(${installFixture.toString()})(${JSON.stringify({teamCount:9,role:current.searchParams.get('visualRole')==='player'?'player':'commissioner',partialDraft:['/draft.html','/captain.html','/admin.html'].includes(current.pathname)})});`});}
          if(url.origin===host.origin)return route.continue();
          return route.abort();
        });
      } else {
        // Page startup can create missing player logins. Block all writes, even those not caused by a click.
        await context.route('**/*',async route=>{
          if(previewRequestAllowed(route.request()))return route.continue();
          report.blockedWrites++;return route.abort();
        });
      }
      const capture=async name=>{
        await page.evaluate(()=>document.fonts.ready);
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        await page.screenshot({path:path.join(output,`${width}-${name}.png`),animations:'disabled',fullPage:false});
        await page.screenshot({path:path.join(output,`${width}-${name}-full.png`),animations:'disabled',fullPage:true});
        const result=await page.evaluate(auditDOM);
        if(name==='broadcast'&&result.auditedRoot!=='broadcastOverlay')throw new Error('Broadcast audit did not inspect the active overlay');
        for(const selector of result.fixedNavOcclusions){
          await page.locator(selector).evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
          const reachable=await page.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&(e===hit||e.contains(hit)||hit.contains(e));});
          if(!reachable)result.overlappingControls.push([selector,'unreachable behind fixed navigation']);
        }
        if(result.fixedNavOcclusions.length)await page.screenshot({path:path.join(output,`${width}-${name}-scrolled.png`),animations:'disabled'});
        report.checks.push({width,page:name,...result});
        console.log(`${width} ${name}: ${result.horizontalOverflow?'OVERFLOW':'bounded'}, ${result.outsideControls.length} outside controls, ${result.clippedText.length} clipped labels, ${result.overlappingControls.length} control overlaps`);
      };
      try{
        await page.goto(host.origin+'/scoring.html#hub');
        await page.locator('#appHub:not(.hidden)').waitFor({timeout:20000});
        await capture('main-menu');
        await page.locator('#hubScoring').click();
        await page.locator('#appHub').waitFor({state:'hidden'});
        await capture('home');
        await verifyNavigation(page,width,capture);
        // Use the app's event handlers without submitting or saving anything. Navigation reachability is audited separately in screenshots.
        for(const view of ['leaderboard','teams','players','course','progress','clubhouse','trash','scoring','admin','rankings']){
          const sel=view==='rankings'?`[data-more-view="${view}"]`:`.tab[data-view="${view}"]`;
          await page.locator(sel).evaluate(e=>e.click());
          await page.locator(`#${view}View:not(.hidden)`).waitFor({timeout:5000});
          await capture(view);
        }
        await page.locator('#playerExtrasToggle').evaluate(e=>e.click());
        await page.locator('#extrasView:not(.hidden)').waitFor({timeout:5000});
        await capture('extras');
        const extraScroller=page.locator('#extrasView .extras-scroll');
        const extraHeight=await extraScroller.evaluate(e=>({height:e.clientHeight,total:e.scrollHeight}));
        for(let offset=extraHeight.height,part=1;offset<extraHeight.total&&extraHeight.height>0;offset+=extraHeight.height,part++){await extraScroller.evaluate((e,y)=>e.scrollTo({top:y,behavior:'instant'}),offset);await capture('extras-part'+part);}
        await page.locator('#openBroadcast').evaluate(e=>e.click());
        await page.locator('#broadcastOverlay.open').waitFor({timeout:5000});
        await capture('broadcast');
        for(const name of ['draft','captain','admin']){
          await page.goto(host.origin+'/'+name+'.html');
          if(name==='admin')await page.locator('#adminApp #grows input').first().waitFor({state:'visible',timeout:15000});
          else{await page.locator('#teams .team').first().waitFor({state:'visible',timeout:15000});await page.waitForFunction(()=>document.querySelector('#connection')?.textContent==='LIVE',{},{timeout:10000});}
          if(name==='captain')await page.locator('#app').waitFor({state:'visible'});
          await capture(name==='admin'?'draft-admin':name);
        }
        if(!live){
          await page.goto(host.origin+'/scoring.html?visualSignedOut=1');
          await page.locator('#loginCard').waitFor({state:'visible'});await capture('sign-in');
          await page.goto(host.origin+'/scoring.html?visualRole=player#hub');
          await page.locator('#appHub:not(.hidden)').waitFor();await page.locator('#hubScoring').click();
          await page.locator('#appHub').waitFor({state:'hidden'});await capture('player-home');
          await verifyNavigation(page,width,capture,'player-');
          await page.locator(width<700?'[data-mobile-view="leaderboard"]':'.tab[data-view="leaderboard"]').click();
          await page.locator('#leaderboardView:not(.hidden)').waitFor();await capture('player-my-score');
        }
      }catch(e){report.errors.push({width,message:e.message.split('\n')[0]});console.error(width,e.message.split('\n')[0]);await page.screenshot({path:path.join(output,`${width}-capture-error.png`)}).catch(()=>{});}
      finally{await context.close();}
    }
  }finally{
    await browser?.close();await new Promise(resolve=>host.server?host.server.close(resolve):resolve());
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2),{mode:0o600});
  }
  const problems=report.checks.filter(c=>c.horizontalOverflow||c.outsideControls.length||c.overlappingControls.length||c.clippedText.length);
  console.log(`Captured ${report.checks.length} views. ${problems.length} need review; ${report.errors.length} startup/navigation errors.`);
  if(problems.length||report.errors.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={WIDTHS,previewURL,previewRequestAllowed,auditDOM};
