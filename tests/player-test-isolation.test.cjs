const fs=require('node:fs'),assert=require('node:assert/strict'),test=require('node:test');
const html=fs.readFileSync('player-scoring-test.html','utf8');
test('completed player test page is inert',()=>{assert(html.includes('Player scoring tests complete'));assert(!/<script\b|<form\b|supabase|\.rpc\(|functions\.invoke/i.test(html));});
test('completed player test page returns users to production',()=>{assert(html.includes('temporary golfer links have been removed'));assert(html.includes('href="./scoring.html#hub"'));});
