const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('acceptance-scoring.html', 'utf8');
const start = html.indexOf('const acceptanceSplit=');
const end = html.indexOf('// This generated page', start);
assert(start >= 0 && end > start);
const selection = html.slice(start, end);
for (const [query, format] of [['', 'standard'], ['?format=split', 'split'], ['?format=elleng-cup-live&tournament_id=elleng-cup-live', 'standard'], ['?format=split&draft_id=elleng-cup', 'split']]) {
  const context = {URLSearchParams, location: {search: query}};
  const result = vm.runInNewContext(selection + '\n({TOURNAMENT_ID,DRAFT_ID})', context);
  assert.equal(result.TOURNAMENT_ID, `elleng-acceptance-${format}-20261029`);
  assert.equal(result.DRAFT_ID, `elleng-acceptance-${format}-draft-20261029`);
}
assert(!html.includes('elleng-cup-live'));
assert(html.includes('OFFLINE_SCORE_KEY="elleng_acceptance_offline_v1"'));
assert(html.includes('SCORING TEST — SYNTHETIC EVENT'));
const edgeStart = html.indexOf('db.functions.invoke=async()=>');
const edgeEnd = html.indexOf('\n', edgeStart);
const context = {db: {functions: {}}};
vm.runInNewContext(html.slice(edgeStart, edgeEnd), context);
context.db.functions.invoke('captain-admin', {body: {action: 'reset_tournament'}}).then(result => {
  assert(result.error);
  console.log('PASS: fixed test IDs for four query variants; separate queue; account/ancillary mutations blocked; visible test banner');
});
let scripts = 0;
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (!match[1].includes('src=')) {new vm.Script(match[2]); scripts++;}
}
console.log(`PASS: ${scripts} inline scripts parse`);
