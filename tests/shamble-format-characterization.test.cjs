'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('scoring.html','utf8');
const a=html.indexOf('async function savePlayerShambleScore('),b=html.indexOf('function renderPairScoring(',a);
assert.ok(a>=0&&b>a);const source=html.slice(a,b);
test('Shamble writes exactly once through authorized atomic RPC, never direct tables',()=>{
 assert.match(source,/db\.rpc\("elleng_test_authorized_shamble"/);
 assert.doesNotMatch(source,/db\.from\("elleng_(player_hole|team)_scores"\)/);
});
test('Standard shamble restricts entry to back nine; points format supports all 18 and snapshots hole',()=>{
 assert.match(source,/hole<\(typeof isShamblePoints==="function"&&isShamblePoints\(\)\?1:10\)\|\|hole>18/);assert.match(source,/const scoreHole=hole/);
});
test('clearing a golfer submits null atomically for server-side team score recalculation',()=>{
 assert.match(source,/String\(val\?\?""\)\.trim\(\)===""\?null:Number\(val\)/);
 assert.match(source,/p_score:score/);
});
test('split-pair blank entries remain clearable',()=>{
 const a=html.indexOf('async function savePairScore('),b=html.indexOf('function renderScoring(',a);
 assert.ok(a>=0&&b>a);
 assert.match(html.slice(a,b),/String\(val\?\?""\)\.trim\(\)===""\?null:Number\(val\)/);
});

