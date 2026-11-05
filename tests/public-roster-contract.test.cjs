const fs = require('node:fs');
const assert = require('node:assert/strict');
const source = fs.readFileSync('supabase/functions/player-public-roster/index.ts', 'utf8');
assert.match(source, /admin\.auth\.getUser\(/, 'verify the caller token');
assert.match(source, /if \(request\.method !== 'POST'\) return reply\(405/, 'reject non-POST roster requests');
assert.match(source, /if \(!\/\^Bearer/, 'reject missing or malformed bearer authorization');
assert.match(source, /if \(authError \|\| !auth\.user\) return reply\(401/, 'reject invalid or expired sessions');
assert.doesNotMatch(source, /return reply\(403, \{ error: 'Golfer access required' \}\)/, 'signed-in golfers can view directory before tournament selection');
assert.match(source, /\.select\('state'\)\.eq\('id', draftId\)/, 'resolve golfer state from scoped tournament');
assert.match(source, /\.select\('golfer_index,username,display_name,photo_url'\)\.eq\('draft_id', draftId\)/, 'scope public roster to current tournament');
assert.doesNotMatch(source, /return reply\(200,\s*\{\s*(accounts|auth|draft)\s*\}/, 'never return raw account, auth or draft records');
assert.doesNotMatch(source, /if \(!member &&/, 'do not confuse tournament membership with registered-directory visibility');
assert.match(source, /\.select\('golfer_index,username,display_name,photo_url'\)/, 'fetch only roster linkage fields');
assert.match(source, /displayName, photoUrl:.*participating:.*golferIndex:.*accountIndex:/, 'return public roster fields only');
assert.doesNotMatch(source, /select\('\*'\)/, 'never select all private account columns');
assert.doesNotMatch(source, /auth\.admin\.listUsers|updateUserById|deleteUser/, 'endpoint must not manage accounts');
console.log('Authenticated public roster source contract passed');

const html = fs.readFileSync('scoring.html', 'utf8');
assert.ok(source.includes(String.raw`/^Bearer\s+\S+$/i`), 'bearer token syntax must use real whitespace classes');
assert.match(html, /async function loadPublicRoster\(\)/, 'roster loader exists');
assert.match(html, /if\(!Array\.isArray\(data\?\.players\)\)throw new Error\("Invalid public roster response"\)/, 'malformed account directory must be treated as unavailable');
assert.match(html, /publicRosterUnavailable=true/, 'failed account directory must record unavailable state');
assert.match(html, /Registered account directory is temporarily unavailable/, 'regular golfers must see when the account directory is incomplete');
assert.match(html, /root\.innerHTML=rosterWarning\+/, 'render account directory warning instead of silently hiding accounts');
assert.match(html, /loadPublicRoster\(\),/, 'roster loads on app startup');
assert.match(html, /const inactiveAccounts=publicRoster\.filter\(a=>!a\.participating/, 'nonparticipants shown without relying on null indices');
assert.doesNotMatch(html, /const inactiveAccounts=isCommissioner\?/, 'directory visibility is not commissioner-only');

assert.match(source, /account\.golfer_index == null \? NaN : Number\(account\.golfer_index\)/, 'missing golfer index must never map to golfer zero');
assert.match(html, /g\.participating===false\?"Not in this tournament"/, 'nonparticipants labeled outside tournament');

assert.ok(html.includes('g.index===(Number.isInteger(a.golferIndex)?a.golferIndex:a.accountIndex)'), 'directory deduplicates by stable golfer or account index, never shared display name');
assert.doesNotMatch(html, /g\.name\.toLowerCase\(\)===a\.displayName\.toLowerCase\(\)/, 'a same-name account must not disappear from the directory');

const fixture = fs.readFileSync('tests/visual/fixture.cjs', 'utf8');
assert.match(fixture, /name === 'player-public-roster'/, 'isolated browser fixture must serve authenticated roster endpoint');
assert.match(fixture, /Array\.from\(\{length:13\}/, 'browser fixture must include thirteen registered nonparticipants');
assert.match(fixture, /displayName:i===0\?'Registered Reserve Golfer'/, 'fixture must preserve named reserve sentinel');
assert.doesNotMatch(html, /Not in this tournament · Account preserved/, 'removed account-preserved wording must stay removed');

const vm = require('node:vm');
const mapping = source.slice(source.indexOf('const players ='), source.indexOf('return reply(200, { players });'));
const context = { accounts: [
  { golfer_index: 0, username: 'active', display_name: 'Old Name', photo_url: 'old.png' },
  { golfer_index: 35, username: 'reserve', display_name: 'Reserve Golfer', photo_url: 'reserve.png' },
  { golfer_index: null, username: 'unlinked' }
], golfers: [{ name: 'Active Golfer', photo_url: 'active.png' }] };
vm.createContext(context);
vm.runInContext(mapping + ';globalThis.result = players;', context);
const rows = JSON.parse(JSON.stringify(context.result));
assert.deepEqual(rows.find(p => p.displayName === 'Reserve Golfer'), {
  displayName: 'Reserve Golfer', photoUrl: 'reserve.png', participating: false, golferIndex: null, accountIndex: 35
}, 'preserved account retains its full name, photo and management identity outside the draft');
assert.deepEqual(rows.find(p => p.displayName === 'Active Golfer'), {
  displayName: 'Active Golfer', photoUrl: 'active.png', participating: true, golferIndex: 0, accountIndex: 0
}, 'active golfer profile takes precedence over account fallback');
assert.deepEqual(rows.find(p => p.displayName === 'unlinked'), {
  displayName: 'unlinked', photoUrl: '', participating: false, golferIndex: null, accountIndex: null
}, 'unlinked account never borrows golfer zero profile');
console.log('Public roster profile mapping passed');
