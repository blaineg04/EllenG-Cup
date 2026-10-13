const test = require('node:test');
const assert = require('node:assert/strict');
const { FORMATS, planPairings } = require('../two-v-two.js');

function players(prefix, count) {
  return Array.from({length:count}, (_,i) => ({id:prefix + (i+1)}));
}

for (const format of Object.keys(FORMATS)) {
  test('2v2 ' + format + ' handles one match', () => {
    const result = planPairings(players('A',2), players('B',2), format);
    assert.equal(result.ok, true);
    assert.equal(result.matches.length, 1);
    assert.deepEqual(result.matches[0].teamA, ['A1','A2']);
    assert.deepEqual(result.matches[0].teamB, ['B1','B2']);
  });
  test('2v2 ' + format + ' handles four matches', () => {
    const result = planPairings(players('A',8), players('B',8), format);
    assert.equal(result.ok, true);
    assert.equal(result.matches.length, 4);
  });
}

test('2v2 rejects unequal rosters', () => {
  assert.equal(planPairings(players('A',4), players('B',2), 'scramble').ok, false);
});
test('2v2 rejects odd rosters', () => {
  assert.equal(planPairings(players('A',3), players('B',3), 'shamble').ok, false);
});
test('2v2 rejects duplicate players', () => {
  assert.equal(planPairings(players('A',2), [{id:'A1'},{id:'B2'}], 'best_ball').ok, false);
});
test('2v2 rejects unsupported formats', () => {
  assert.equal(planPairings(players('A',2), players('B',2), 'other').ok, false);
});
