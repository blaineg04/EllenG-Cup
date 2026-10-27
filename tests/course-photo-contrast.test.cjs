'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('course overlay keeps text light against the photo despite card-wide text styles',()=>{
 const source=fs.readFileSync('scoring.html','utf8');
 assert.match(source,/\.card\s+\.course-overlay\s+h2\s*,\s*\.card\s+\.course-overlay\s+\.status\s*\{[^}]*color\s*:\s*#fff\s*!important/s);
});
