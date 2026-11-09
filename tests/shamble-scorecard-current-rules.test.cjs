const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('scoring.html','utf8');
const start=html.indexOf('function renderShambleScoring(');
const end=html.indexOf('function beginScoreSave(',start);
assert(start>=0&&end>start,'Shamble scoring renderer missing');
const view=html.slice(start,end);
test('score entry instructions reflect all three hole formats',()=>{
 for(const text of ['Par 3: own ball tee-to-cup','Par 4: best drive, then own ball','Par 5: best first two shots, then own ball'])assert.ok(view.includes(text),text);
});
test('score entry does not claim lowest golfer score alone counts',()=>{
 assert.ok(view.includes('EVERY GOLFER COUNTS'));
 assert.ok(view.includes('Individual Cup points count toward the team total'));
 for(const old of ['LOW SCORE COUNTS','LOW TEAM SCORE','Best tee shot, then everyone plays their own ball.'])assert.ok(!view.includes(old),old);
});
