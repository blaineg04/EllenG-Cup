const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const html = fs.readFileSync('scoring.html', 'utf8');
assert.match(html, /function renderPlayersDirectory\(\)/);
assert.match(html, /g\.participating===false\?"Not in this tournament"/, 'nonparticipants must be labeled correctly');
assert.match(html, /Not in this tournament · Account preserved/);
assert.match(html, /const band=playerBandLabel\(g\);const bandChip=/, 'public directory shows handicap band rather than exact handicap');
assert.match(html, /const rawHcp=isRanked\?String\(g\.hcp\?\?""\)\.trim\(\):""/, 'commissioner handicap editor must leave unranked exact handicap blank');
assert.match(html, /const displayHcp=selfRanked&&String\(g\.hcp\?\?""\)\.trim\(\)!==""\?String\(g\.hcp\):"—"/, 'personal handicap display must hide stale unranked handicap');
assert.match(html, /function renderRegisteredAccountSummary\(\)/, 'commissioner must see registered accounts outside tournament');
assert.match(html, /playerAccounts\.filter\(a=>\{/, 'commissioner summary uses actual registered accounts');
assert.match(html, /!golfers\[i\]\?\.name/, 'account-only entries remain separate from tournament golfer records');
assert.match(html, /a\.golfer_index==null\?NaN:Number\(a\.golfer_index\)/, 'missing account index must not be mistaken for golfer zero');
assert.match(html, /renderRegisteredAccountSummary\(\)/, 'commissioner player editor renders preserved account summary');
assert.match(html, /id="registeredAccountSummary"/, 'commissioner has a dedicated registered account section');
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
const mixedCount = vm.runInNewContext(`${golferCountFunction}; draftGolferCount()`, {
  draftState: { playFormat: 'shamble_points', golferCount: 35, golfers: [
    ...Array.from({ length: 23 }, (_, i) => ({ name: `Participating ${i + 1}` })),
    ...Array.from({ length: 13 }, (_, i) => ({ name: `Registered Reserve ${i + 1}`, participating: false }))
  ] },
  isShamblePoints: () => true
});
assert.equal(mixedCount, 23, '23 participants plus 13 preserved nonparticipants must yield 23');
const draftHtml = fs.readFileSync('draft.html', 'utf8');
assert.match(draftHtml, /S\.golfers\.filter\(g=>g\?\.name && g\.participating!==false\)/, 'draft completion excludes nonparticipants');
assert.match(draftHtml, /S\.golfers\.filter\(g=>g\.name && g\.participating!==false && g\.team==null\)/, 'available pool excludes nonparticipants');

assert.equal(countFor('standard', ['A', 'B', 'C'], 24), 24, 'standard setup count remains unchanged');
assert.match(html, /function pointsHoleCards\(showEmpty=false,onlyHole=null,maxTeams=null\)/);
assert.match(html, /pointsHoleCards\(true, null, 2\)/);
assert.match(html, /Awaiting draft/);
assert.match(html, /values\.slice\(0,2\)\.every\(v=>v\.expected>0&&v\.complete\)/);
console.log('Players directory and two-team progress source contracts passed');
