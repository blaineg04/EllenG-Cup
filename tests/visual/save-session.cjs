// Run directly on your Mac. Enter credentials only in the local browser, never in terminal or chat.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path');
const {previewURL,previewRequestAllowed}=require('./run.cjs');
(async()=>{
 if(process.env.CI)throw new Error('Session capture is local only.');
 const origin=previewURL(process.env.ELLENG_PREVIEW_URL||'https://elleng-cup-git-release-nov20-score-integr-97dac7-blaineg04-3428.vercel.app');
 const file=path.resolve(__dirname,'../../playwright/.auth/elleng.storage-state.json');
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const browser=await chromium.launch({headless:false});
 try{
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',route=>previewRequestAllowed(route.request(),true)?route.continue():route.abort());
  const page=await context.newPage();await page.goto(origin+'/scoring.html');
  console.log('Sign in to the development preview in the local browser. Tournament writes are blocked.');
  await page.locator('#appHub:not(.hidden)').waitFor({state:'visible',timeout:300000});
  const state=await context.storageState();fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});fs.chmodSync(file,0o600);
  console.log('Signed-in session saved locally in the ignored playwright/.auth directory.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
