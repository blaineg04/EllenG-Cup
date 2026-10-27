'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('draft roster overrides the earlier dark team-slot background with a light surface',()=>{
 const css=fs.readFileSync('draft.html','utf8');
 const rules=[...css.matchAll(/\.team\s+\.slot\s*\{([^}]*)\}/g)];
 assert.ok(rules.length,'Expected a team-specific roster rule');
 assert.match(rules.at(-1)[1],/background\s*:\s*#fffdfa\s*!important/i);
});
