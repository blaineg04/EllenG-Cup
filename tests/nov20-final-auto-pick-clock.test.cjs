const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname,'..','sql','nov20-auto-pick-balance-fallback.sql'),'utf8');
test('final automatic pick must stop the clock',()=>{
  assert.match(sql,/if jsonb_array_length\(coalesce\(v_state->'picks','\[\]'::jsonb\)\) >= v_total_picks then/);
  assert.match(sql,/jsonb_set\(v_state,'\{timerPaused\}','true'::jsonb,true\)/);
  assert.match(sql,/jsonb_set\(v_state,'\{timerEndsAt\}','null'::jsonb,true\)/);
});
