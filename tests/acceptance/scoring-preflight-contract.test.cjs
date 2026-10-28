const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const scoring = read('scoring.html');
const preflight = read('tests/acceptance/scoring-deployment-preflight.sql');
const split = read('db/patches/20261028_split_pair_atomic_rpc_REVIEW_ONLY.sql');
const shamble = read('tests/acceptance/authorized-shamble-rpc-proposal.sql');

test('read-only preflight covers both RPC names used in browser scoring', () => {
  for (const name of ['elleng_test_authorized_split_pair', 'elleng_test_authorized_shamble']) {
    assert.ok(scoring.includes('db.rpc("' + name + '"'), 'browser missing RPC: ' + name);
    assert.ok(preflight.includes("('" + name + "'"), 'preflight missing RPC: ' + name);
  }
});

test('Split-Pair RPC and preflight agree on exact PostgreSQL argument signature', () => {
  assert.match(split, /CREATE OR REPLACE FUNCTION public\.elleng_test_authorized_split_pair\(\s*p_tournament_id text, p_team_index integer, p_hole integer,\s*p_pair_index integer, p_score integer/);
  assert.ok(preflight.includes("('elleng_test_authorized_split_pair','(text,integer,integer,integer,integer)')"));
});

test('Shamble RPC and preflight agree on exact PostgreSQL argument signature', () => {
  assert.match(shamble, /CREATE OR REPLACE FUNCTION public\\.elleng_test_authorized_shamble\\(\\s*p_tournament_id text, p_team_index integer, p_hole integer,\\s*p_golfer_index integer, p_score integer/);
  assert.ok(preflight.includes("('elleng_test_authorized_shamble','(text,integer,integer,integer,integer)')"));
});

test('preflight is read-only and checks both authentication and RLS gates', () => {
  assert.doesNotMatch(preflight, /^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE)\b/gim);
  assert.match(preflight, /has_function_privilege\('authenticated'/);
  assert.match(preflight, /has_function_privilege\('anon'/);
  assert.match(preflight, /relrowsecurity/);
  assert.match(preflight, /pg_policies/);
});
