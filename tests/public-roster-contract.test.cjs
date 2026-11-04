const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync('supabase/functions/player-public-roster/index.ts', 'utf8');
assert.match(source, /admin\.auth\.getUser\(/, 'verify the caller token');
assert.match(source, /if \(!member && draft\.owner_id !== auth\.user\.id\)/, 'require linked golfer or commissioner');
assert.match(source, /\.select\('golfer_index,username'\)/, 'fetch only roster linkage fields');
assert.match(source, /displayName, participating:.*golferIndex:/, 'return public roster fields only');
assert.doesNotMatch(source, /select\('\*'\)/, 'never select all private account columns');
assert.doesNotMatch(source, /auth\.admin\.listUsers|updateUserById|deleteUser/, 'endpoint must not manage accounts');
console.log('Authenticated public roster source contract passed');

const html = fs.readFileSync('scoring.html', 'utf8');
assert.ok(source.includes(String.raw`/^Bearer\s+\S+$/i`), 'bearer token syntax must use real whitespace classes');
assert.match(html, /async function loadPublicRoster\(\)/, 'roster loader exists');
assert.match(html, /loadPublicRoster\(\),/, 'roster loads on app startup');
assert.match(html, /const inactiveAccounts=publicRoster\.filter\(a=>!a\.participating/, 'nonparticipants shown without relying on null indices');
assert.doesNotMatch(html, /const inactiveAccounts=isCommissioner\?/, 'directory visibility is not commissioner-only');

assert.match(source, /account\.golfer_index == null \? NaN : Number\(account\.golfer_index\)/, 'missing golfer index must never map to golfer zero');
assert.match(html, /g\.participating===false\?"Not in this tournament"/, 'nonparticipants labeled outside tournament');

assert.match(html, /!golfers\.some\(g=>Number\.isInteger\(a\.golferIndex\)&&g\.index===a\.golferIndex\)/, 'directory deduplicates by linked golfer index, never by possibly shared display name');
assert.doesNotMatch(html, /g\.name\.toLowerCase\(\)===a\.displayName\.toLowerCase\(\)/, 'a same-name account must not disappear from the directory');

const fixture = fs.readFileSync('tests/visual/fixture.cjs', 'utf8');
assert.match(fixture, /name === 'player-public-roster'/, 'isolated browser fixture must serve authenticated roster endpoint');
assert.match(fixture, /Array\.from\(\{length:13\}/, 'browser fixture must include thirteen registered nonparticipants');
assert.match(fixture, /displayName:i===0\?'Registered Reserve Golfer'/, 'fixture must preserve named reserve sentinel');
assert.match(html, /Not in this tournament · Account preserved/, 'directory must label account-only golfers without putting them in draft');
