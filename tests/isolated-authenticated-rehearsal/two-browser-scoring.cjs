// Two independent browser contexts share a disposable local scoring store.
// Synthetic auth only: never contacts production or claims real Supabase auth coverage.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{chromium}=require('../visual/node_modules/playwright');
const {installFixture}=require('../visual/shamble-fixture.cjs');
const root=path.resolve(__dirname,'../..'),scores=new Map();
(async()=>{
 const server=http.createServer((req,res)=>{
   const u=new URL(req.url,'http://127.0.0.1');
   if(u.pathname==='/__rehearsal/scores'){
     res.setHeader('Content-Type','application/json');
     if(req.method==='GET')return res.end(JSON.stringify([...scores.values()]));
     if(req.method!=='POST'){res.writeHead(405);return res.end();}
     let body='';req.on('data',c=>body+=c);req.on('end',()=>{
       try{const data=JSON.parse(body);
         if(data.actor!=='golfer-a'||data.golfer_index!==0||!Number.isInteger(data.hole)||data.hole<1||data.hole>18)throw Error('Unauthorized synthetic score write');
         const key=data.golfer_index+':'+data.hole;
         if(data.score===null)scores.delete(key);
         else{if(!Number.isInteger(data.score)||data.score<1)throw Error('Invalid strokes');scores.set(key,{golfer_index:0,team_index:0,hole:data.hole,score:data.score});}
         res.end(JSON.stringify({ok:true}));
       }catch(e){res.writeHead(403);res.end(JSON.stringify({error:e.message}));}
     });return;
   }
   const file=path.resolve(root,'.'+u.pathname);
   if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
   fs.readFile(file,(err,body)=>{if(err){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(body);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
   async function open(){
     const context=await browser.newContext({serviceWorkers:'block'});
     const page=await context.newPage();page.setDefaultTimeout(9000);
     page.on('pageerror',error=>console.error('REHEARSAL PAGE ERROR:',error.message));
     page.on('console',message=>{if(message.type()==='error')console.error('REHEARSAL CONSOLE:',message.text());});
     await page.route('**/*',route=>{
       const u=new URL(route.request().url());
       if(u.hostname==='cdn.jsdelivr.net'&&u.pathname.includes('supabase-js')){
         const script='('+installFixture.toString()+')({teamCount:2,role:"player"});'+`
           (()=>{const original=window.supabase.createClient;
             window.supabase.createClient=(...args)=>{const client=original(...args);
               const oldFrom=client.from.bind(client),oldInvoke=client.functions.invoke.bind(client.functions);
               client.from=(table)=>table==='elleng_player_hole_scores'?{
                 select(){return this;},eq(){return this;},order(){return this;},range(start,end){this.start=start;this.end=end;return this;},limit(){return this;},
                 then(resolve,reject){return fetch('/__rehearsal/scores').then(r=>r.json()).then(rows=>resolve({data:rows.slice(this.start||0,(this.end??rows.length-1)+1),count:rows.length,error:null}),reject);}
               }:oldFrom(table);
               client.functions.invoke=async(name,options)=>{
                 if(name==='golfer-handicap'&&options?.body?.action==='update_score'){
                   const body=options.body;
                   const response=await fetch('/__rehearsal/scores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor:'golfer-a',golfer_index:0,hole:Number(body.hole),score:body.score===null?null:Number(body.score)})});
                   const data=await response.json();return response.ok?{data,error:null}:{data:null,error:{message:data.error}};
                 }
                 return oldInvoke(name,options);
               };return client;
             };
           })();`;
         return route.fulfill({contentType:'text/javascript',body:script});
       }
       if(u.origin===origin)return route.continue();
       return route.abort('blockedbyclient');
     });
     await page.addInitScript(()=>{const original=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>original(typeof fn==='function'&&fn.name==='goHome'&&delay===450?()=>fn(...args):fn,delay,...args)});
     await page.goto(origin+'/scoring.html#hub');
     await page.waitForTimeout(1200);
     console.log('REHEARSAL STATE',await page.evaluate(()=>({hub:document.querySelector('#appHub')?.className,scoring:document.querySelector('#hubScoring')?.outerHTML.slice(0,160),supabase:!!window.supabase,body:document.body.className,loginText:document.querySelector('#loginView')?.innerText?.slice(0,300),url:location.href})));
     await page.locator('#hubScoring').click();
     await page.locator('#appHub').waitFor({state:'hidden'});
     return {page,context};
   }
   const first=await open(),second=await open();
   await first.page.locator('#selfScoreHole').selectOption('18');
   await first.page.locator('#selfScoreInput').fill('3');
   await first.page.locator('#saveSelfScore').click();
   await first.page.locator('#selfScoreMsg').getByText(/Saved/).waitFor();
   assert.equal(scores.get('0:18').score,3);
   await second.page.reload();
   await second.page.locator('#hubScoring').click();
   await second.page.locator('#appHub').waitFor({state:'hidden'});
   await second.page.locator('#selfScoreHole').selectOption('18');
   assert.equal(await second.page.locator('#selfScoreInput').inputValue(),'3','Second browser must see saved score');
   await first.context.close();await second.context.close();
   console.log('PASS: two independent scoring browser contexts, one shared disposable local store, save and reload');
   console.log('LIMITATION: synthetic auth/API adapter, not actual Supabase authenticated production E2E');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
