'use strict';
// Characterization tests: freeze the existing release candidate's back-nine
// low-ball Shamble behavior before considering alternate individual-points rules.
// This file never connects to the live Supabase project.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('scoring.html','utf8');
const start=html.indexOf('async function savePlayerShambleScore(');
const end=html.indexOf('function renderPairScoring(',start);
assert.ok(start>=0&&end>start,'Missing Shamble score handler');
const source=html.slice(start,end);
test('existing Shamble scoring writes a player entry and its derived team low-ball score',()=>{
  assert.match(source,/db\.from\("elleng_player_hole_scores"\)\.upsert/);
  assert.match(source,/Math\.min\(\.\.\.rows\.map/);
  assert.match(source,/db\.from\("elleng_team_scores"\)\.upsert/);
});
test('existing Shamble scoring restricts entry to back-nine holes',()=>{
  assert.match(source,/hole<10\|\|hole>18/);
  assert.match(source,/const scoreHole=hole/);
});
test('existing incomplete Shamble roster clears the derived team score',()=>{
  assert.match(source,/db\.from\("elleng_team_scores"\)\.delete/);
});

test('blank and whitespace-only score inputs use the clear path instead of numeric zero',()=>{
  assert.match(source,/String\(val\?\?""\)\.trim\(\)===""\?null:Number\(val\)/);
});

test('split-pair empty input also clears rather than writing numeric zero',()=>{
 const a=html.indexOf('async function savePairScore('),b=html.indexOf('function renderScoring(',a);
 assert.ok(a>=0&&b>a);
 assert.match(html.slice(a,b),/String\(val\?\?""\)\.trim\(\)===""\?null:Number\(val\)/);
});
