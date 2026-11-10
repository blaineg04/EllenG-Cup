const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('../visual/node_modules/playwright');
const root = path.resolve(__dirname, '../..');
const productionHost = /(?:^|\\.)elleng-cup\\.vercel\\.app$|xepccqedhbucpbwuykoc/i;
const observed = [];
(async () => {
  const server = http.createServer((req, res) => {
    const requested = new URL(req.url, 'http://127.0.0.1').pathname;
    const file = path.resolve(root, '.' + requested);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      res.end(body);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({headless:true});
  try {
    for (const pageName of ['admin.html', 'captain.html', 'draft.html', 'scoring.html']) {
      const context = await browser.newContext({serviceWorkers:'block'});
      const page = await context.newPage();
      await page.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        observed.push({url:req.url(),method:req.method()});
        if (url.origin === origin && ['GET','HEAD'].includes(req.method())) return route.continue();
        return route.abort('blockedbyclient');
      });
      await page.goto(origin + '/' + pageName, {waitUntil:'domcontentloaded'});
      await page.waitForTimeout(250);
      await context.close();
    }
    assert(observed.some(x => x.url.startsWith(origin)), 'Local page requests were not observed');
    assert(!observed.some(x => productionHost.test(new URL(x.url).hostname) && !['GET','HEAD'].includes(x.method)), 'Production write attempt observed');
    console.log('PASS: four local pages loaded; all external requests and all writes blocked (' + observed.length + ' requests inspected)');
    console.log('NOTE: safety gate only; authenticated local persistence still requires disposable auth/database adapter');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
})().catch(e => {console.error(e); process.exitCode=1;});
