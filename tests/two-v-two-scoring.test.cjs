const test=require('node:test');
const assert=require('node:assert/strict');
const {teamHoleScore,compareHole}=require('../two-v-two-scoring.js');

test('scramble uses the single team score',()=>{
 assert.deepEqual(teamHoleScore('scramble',1,{teamStrokes:4}),{ok:true,strokes:4,format:'scramble'});
});
test('best ball uses lower of two scores',()=>{
 assert.equal(teamHoleScore('best_ball',3,{playerStrokes:[5,3]}).strokes,3);
});
test('shamble uses lower finishing score',()=>{
 assert.equal(teamHoleScore('shamble',4,{playerStrokes:[6,4]}).strokes,4);
});
test('split nine uses scramble on hole nine',()=>{
 assert.equal(teamHoleScore('split_nine',9,{teamStrokes:5}).format,'scramble');
});
test('split nine uses shamble on hole ten',()=>{
 assert.equal(teamHoleScore('split_nine',10,{playerStrokes:[4,6]}).format,'shamble');
});
test('comparison selects lower score',()=>{
 assert.equal(compareHole('scramble',1,{teamStrokes:3},{teamStrokes:4}).winner,'A');
});
test('comparison handles ties',()=>{
 assert.equal(compareHole('best_ball',2,{playerStrokes:[4,5]},{playerStrokes:[5,4]}).winner,'tie');
});
test('rejects incomplete individual scoring',()=>{
 assert.equal(teamHoleScore('shamble',1,{playerStrokes:[4]}).ok,false);
});
test('rejects out-of-range holes',()=>{
 assert.equal(teamHoleScore('scramble',19,{teamStrokes:4}).ok,false);
});
test('rejects invalid stroke values',()=>{
 assert.equal(teamHoleScore('scramble',1,{teamStrokes:0}).ok,false);
});
