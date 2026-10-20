const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','scoring.html'),'utf8');
test('commissioner preview describes uneven roster distribution without hiding golfers',()=>{
 assert.match(html,/const mismatch=gc!==tc\*size/);
 assert.match(html,/Review format-specific scoring rules for uneven teams before starting/);
 assert.match(html,/You can still assign golfers manually in the draft/);
});
test('commissioner retains two-team option and blank setup defaults',()=>{
 assert.match(html,/<option value="">— Select number of teams —<\/option>/);
 assert.match(html,/<option value="2">2 teams<\/option>/);
});
