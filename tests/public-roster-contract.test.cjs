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
