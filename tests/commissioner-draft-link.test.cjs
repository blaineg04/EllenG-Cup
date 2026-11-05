const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('commissioner Open Draft Room opens owner-verified draft controls',()=>{
 const html=fs.readFileSync('scoring.html','utf8');
 const link=html.match(/<a\b[^>]*href="([^"]+)"[^>]*>Open Draft Room<\/a>/);
 assert.ok(link,'Commissioner dashboard must expose its draft control link');
 assert.equal(link[1],'admin.html');
 const admin=fs.readFileSync('admin.html','utf8');
 assert.ok(admin.includes('data.owner_id!==user.id'),'Destination must still check draft ownership');
});
