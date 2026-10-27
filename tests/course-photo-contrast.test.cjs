'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('course overlay keeps text light against the photo despite card-wide text styles',()=>{
 const source=fs.readFileSync('scoring.html','utf8');
 assert.match(source,/#app\s+#courseView\s+#courseNameDisplay\s*,\s*#app\s+#courseView\s+#courseRouteDisplay\s*\{[^}]*color\s*:\s*#fff\s*!important/s);
});
