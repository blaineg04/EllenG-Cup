const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true});try{for(const width of [375,390,1440]){
const page=await browser.newPage({viewport:{width,height:844}});await page.route('**/*',r=>r.abort());
const html=fs.readFileSync('scoring.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');await page.setContent(html);
const result=await page.evaluate(()=>{
 document.body.classList.remove('login-mode');
 document.querySelectorAll('.app-hub,.login-overlay,#loginOverlay,#appHub').forEach(e=>e.style.setProperty('display','none','important'));
 const view=document.getElementById('leaderboardView');view.classList.remove('hidden');view.style.display='block';
 const card=document.getElementById('myScoreEntryCard');card.classList.remove('hidden');
 const msg=document.getElementById('selfScoreMsg');msg.textContent='Saved your personal score for Hole 1: 4 strokes (E).';
 const a=msg.getBoundingClientRect(),b=card.getBoundingClientRect(),style=getComputedStyle(msg);
 return {display:style.display,width:a.width,height:a.height,inside:a.top>=b.top&&a.bottom<=b.bottom,cardWidth:b.width};
});assert.notEqual(result.display,'none');assert(result.width>0&&result.height>0);assert(result.inside);console.log('PASS feedback visible within card at width',width,JSON.stringify(result));await page.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
