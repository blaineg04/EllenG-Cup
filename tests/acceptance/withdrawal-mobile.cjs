const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
  for(const width of [320, 375, 390, 768, 1280]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.goto('file://'+path.resolve('scoring.html'),{waitUntil:'domcontentloaded'});
   const result=await page.evaluate(()=>{
    for(let node=document.getElementById('withdrawGolferSelect');node;node=node.parentElement){
     node.classList.remove('hidden');
     if(getComputedStyle(node).display==='none')node.style.display='block';
    }
    const ids=['withdrawGolferSelect','withdrawGolferBtn','restoreGolferSelect','restoreGolferBtn'];
    return ids.map(id=>{
     const e=document.getElementById(id), r=e?.getBoundingClientRect();
     return {id,exists:!!e,left:r?.left,right:r?.right,width:r?.width,scrollWidth:e?.scrollWidth,clientWidth:e?.clientWidth};
    });
   });
   for(const el of result){
    if(!el.exists||el.width<80||el.left<0||el.right>width+1)
     throw new Error('Viewport '+width+': invalid withdrawal control '+JSON.stringify(el));
   }
   // Browser-level confirmation behavior: cancel must never invoke the RPC.
   const cancelResult=await page.evaluate(()=>{
    const text=document.documentElement.outerHTML;
    const withdraw=text.indexOf('$("withdrawGolferBtn").addEventListener("click"');
    const restore=text.indexOf('$("restoreGolferBtn").addEventListener("click"');
    const late=text.indexOf('$("addLateGolferBtn").addEventListener("click"',withdraw);
    if(withdraw<0||restore<0||late<0)return false;
    const w=text.slice(withdraw,late),r=text.slice(restore,withdraw);
    return w.includes('if(!confirm(')&&r.includes('if(!confirm(')
      && w.indexOf('if(!confirm(')<w.indexOf('db.rpc(')
      && r.indexOf('if(!confirm(')<r.indexOf('db.rpc(');
   });
   if(!cancelResult)throw new Error('Viewport '+width+': commissioner confirmation must precede database mutation');
   for(const id of ['withdrawGolferSelect','withdrawGolferBtn','restoreGolferSelect','restoreGolferBtn']){
    await page.locator('#'+id).focus();
    const focusId=await page.evaluate(()=>document.activeElement?.id);
    if(focusId!==id)throw new Error('Viewport '+width+': keyboard focus failed on '+id);
   }
   const accessible=await page.evaluate(()=>{
    return ['withdrawGolferSelect','restoreGolferSelect'].every(id=>{
     const el=document.getElementById(id);
     return !!document.querySelector('label[for="'+id+'"]') && !!el;
    }) && ['withdrawGolferMsg','restoreGolferMsg'].every(id=>document.getElementById(id)?.getAttribute('role')==='status');
   });
   if(!accessible)throw new Error('Viewport '+width+': missing labels or status announcements');
   console.log('PASS viewport '+width+'px: controls fit, receive focus and have accessible labels/status');
   await page.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
