const { chromium } = require('playwright');
const path = require('node:path');
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
  for(const width of [375, 390, 768, 1280]){
   const page=await browser.newPage({viewport:{width,height:850}});
   await page.goto('file://'+path.resolve('scoring.html'),{waitUntil:'domcontentloaded'});
   const result=await page.evaluate(()=>{
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
   console.log('PASS viewport '+width+'px: withdrawal and restore controls fit');
   await page.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
