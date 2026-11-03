const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const html = fs.readFileSync('scoring.html', 'utf8');
assert.match(html, /function renderPlayersDirectory\(\)/);
assert.match(html, /const activeIndices=new Set\(golfers\.map\(g=>g\.index\)\)/);
assert.match(html, /Not in this tournament · Account preserved/);
const activeTeamFunction = html.match(/function activeTeamCount\(\)\s*\{[\s\S]*?\n\}/)?.[0];
assert.ok(activeTeamFunction, 'activeTeamCount implementation must exist');
for (const [format, legacyCount, expected] of [
  ['shamble_points', 9, 2],
  ['shamble_points', 2, 2],
  ['standard', 6, 6],
  ['standard', 9, 9]
]) {
  const actual = vm.runInNewContext(`${activeTeamFunction}; activeTeamCount()`, {
    draftState: { playFormat: format }, tournament: { team_count: legacyCount }
  });
  assert.equal(actual, expected, `format=${format} legacy teams=${legacyCount}`);
}
const golferCountFunction = html.match(/function draftGolferCount\(\)\s*\{[^\n]*\}/)?.[0];
assert.ok(golferCountFunction, 'draft golfer count must exist');
const countFor = (format, golfers, storedCount) => vm.runInNewContext(
  `${golferCountFunction}; draftGolferCount()`,
  { draftState: { playFormat: format, golfers: golfers.map(name => ({ name })), golferCount: storedCount }, isShamblePoints: () => format === 'shamble_points' }
);
assert.equal(countFor('shamble_points', ['A', 'B', 'C'], 35), 3, 'stale 35 must not inflate shamble count');
assert.match(golferCountFunction, /g\.participating!==false/, 'nonparticipants excluded from shamble count');
assert.equal(countFor('standard', ['A', 'B', 'C'], 24), 24, 'standard setup count remains unchanged');
assert.match(html, /function pointsHoleCards\(showEmpty=false,onlyHole=null,maxTeams=null\)/);
assert.match(html, /pointsHoleCards\(true, null, 2\)/);
assert.match(html, /Awaiting draft/);
assert.match(html, /values\.slice\(0,2\)\.every\(v=>v\.expected>0&&v\.complete\)/);
console.log('Players directory and two-team progress source contracts passed');
