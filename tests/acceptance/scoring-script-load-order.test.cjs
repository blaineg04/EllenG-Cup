'use strict';
// Prevent silent browser script-loading regressions before the November 13 rehearsal.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('scoring.html', 'utf8');

function parseScriptElements(markup) {
  const tags = [...markup.matchAll(/<\\/?script\\b[^>]*>/gi)];
  const scripts = [];
  let active = null;
  for (const match of tags) {
    const tag = match[0];
    if (/^<script\\b/i.test(tag)) {
      assert.equal(active, null, 'Nested <script> tag: prior script was never closed');
      const src = /\\bsrc\\s*=\\s*["']([^"']+)["']/i.exec(tag)?.[1] || null;
      active = {src, openingEnd: match.index + tag.length};
    } else {
      assert.ok(active, 'Unexpected closing </script> tag');
      if (active.src) {
        assert.equal(markup.slice(active.openingEnd, match.index).trim(), '',
          'External script contains unexpected inline markup (likely missing </script>)');
      }
      scripts.push({...active, closingStart: match.index});
      active = null;
    }
  }
  assert.equal(active, null, 'Unclosed <script> tag');
  return scripts;
}

test('scoring page scripts are balanced and external scripts cannot swallow following tags', () => {
  const scripts = parseScriptElements(html);
  assert.ok(scripts.length >= 5, 'Expected scoring page script elements');
});

test('Supabase, config and RSVP adapter load in order before application initialization', () => {
  const scripts = parseScriptElements(html);
  const sources = scripts.map(s => s.src);
  const supabase = sources.findIndex(s => s?.includes('@supabase/supabase-js'));
  const config = sources.indexOf('config.js');
  const adapter = sources.indexOf('event-rsvp-client.js');
  assert.ok(supabase >= 0 && config > supabase && adapter > config,
    'Supabase, config and RSVP adapter must load in that order');
  assert.ok(scripts.slice(adapter + 1).some(s => !s.src),
    'RSVP adapter must be available before scoring application inline script');
});

test('event-scoped RSVP stays explicitly disabled until authenticated rollout approval', () => {
  assert.match(html, /const EVENT_RSVP_MODE\\s*=\\s*false\\s*;/);
  assert.match(html, /if\\s*\\(EVENT_RSVP_MODE\\)/);
  assert.match(html, /from\\(["']elleng_rsvps["']\\)/);
});

test('script parser rejects the original malformed nested external-script regression', () => {
  assert.throws(() => parseScriptElements(
    '<script src="config.js">\\n<script src="event-rsvp-client.js"></script></script>'
  ), /Nested <script> tag/);
});
