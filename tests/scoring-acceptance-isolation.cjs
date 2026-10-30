const fs = require('node:fs');
const assert = require('node:assert/strict');
const html = fs.readFileSync('acceptance-scoring.html', 'utf8');
assert(html.includes('Scoring test complete'));
assert(html.includes('synthetic events are archived'));
assert(html.includes('href="./scoring.html#hub"'));
assert(!/<script\b/i.test(html), 'Retired test page must not execute scripts');
assert(!/supabase|\.rpc\(|\.from\(|functions\.invoke|<form\b/i.test(html), 'Retired test page must not access the backend');
console.log('PASS: retired test page contains no scripts, forms or database access');
