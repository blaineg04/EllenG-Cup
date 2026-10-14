const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'scoring.html'), 'utf8');
const start = html.indexOf('async function saveSelfScore(clear=false){');
const end = html.indexOf('\nasync function resetGolferPin(', start);
assert.ok(start >= 0 && end > start, 'personal score-save boundaries exist');
const body = html.slice(start, end);

test('personal save captures the signed-in account before asynchronous work', () => {
  assert.match(body, /const savingAccountId=user\?\.id;/);
  assert.ok(body.indexOf('const savingAccountId=') < body.indexOf('await db.functions.invoke('));
});

test('account changes block success before UI confirmation', () => {
  const guard = body.indexOf('if(user?.id!==savingAccountId)throw new Error(');
  assert.ok(guard >= 0, 'account switch guard exists');
  assert.ok(guard < body.indexOf('renderAll();'));
  assert.ok(guard < body.indexOf('saveSucceeded=true;'));
});

test('accepted server writes with unverified refresh do not enter offline queue', () => {
  assert.match(body, /serverAccepted=true;/);
  assert.match(body, /if\(serverAccepted\)\{/);
  assert.match(body, /Score accepted — refresh unverified/);
  assert.ok(body.indexOf('if(serverAccepted){') < body.indexOf('queueOfflineScore('));
});

test('offline score is clearly local-only and requires review', () => {
  assert.match(body, /Stored on this device only — offline score needs review after reconnecting/);
  assert.doesNotMatch(body, /it will sync automatically/);
});

test('saved status is emitted only after verified success', () => {
  assert.match(body, /if\(saveSucceeded\)setSyncStatus\("saved","Saved ✓"\)/);
  assert.ok(body.indexOf('saveSucceeded=true;') < body.indexOf('if(saveSucceeded)setSyncStatus('));
});
