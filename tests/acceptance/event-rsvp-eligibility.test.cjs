const test=require("node:test");
const assert=require("node:assert/strict");
const {approvedRoster,approve,changeStatus}=require("../../event-rsvp-eligibility.js");
const golfers=[{name:"Golfer A"},{name:"Golfer B"},{name:"Golfer C"}];
const row=(t,u,i,status="playing",approval_status="approved")=>({tournament_id:t,user_id:u,golfer_index:i,status,approval_status});
test("only approved playing golfers from the selected event enter roster",()=>{
 assert.deepEqual(approvedRoster([row("nov20","a",0),row("nov20","b",1,"maybe"),row("next","c",2)],"nov20",golfers),[0]);
});
test("changed RSVP invalidates earlier approval",()=>{
 const changed=changeStatus(row("nov20","a",0),"out");
 assert.equal(changed.approval_status,"pending");
 assert.deepEqual(approvedRoster([changed],"nov20",golfers),[]);
});
test("duplicate event users and golfer identities fail closed",()=>{
 assert.throws(()=>approvedRoster([row("nov20","a",0),row("nov20","a",1)],"nov20",golfers),/Duplicate event RSVP user/);
 assert.throws(()=>approvedRoster([row("nov20","a",0),row("nov20","b",0)],"nov20",golfers),/Duplicate approved golfer/);
});
test("missing directory golfer and malformed statuses fail closed",()=>{
 assert.throws(()=>approvedRoster([row("nov20","a",9)],"nov20",golfers),/missing from directory/);
 assert.throws(()=>approvedRoster([row("nov20","a",0,"unknown")],"nov20",golfers),/Invalid RSVP status/);
});

test("commissioner approval allows playing only and rejects captain approval",()=>{
 const pending=row("nov20","a",0,"playing","pending");
 assert.throws(()=>approve(pending,"approved",{role:"captain",user_id:"captain-id"}),/Commissioner authorization required/);
 const approved=approve(pending,"approved",{role:"commissioner",user_id:"commissioner-id"});
 assert.equal(approved.approved_by,"commissioner-id");
 assert.deepEqual(approvedRoster([approved],"nov20",golfers),[0]);
 assert.throws(()=>approve(row("nov20","b",1,"out","pending"),"approved",{role:"commissioner",user_id:"commissioner-id"}),/Only playing/);
});

test("changing RSVP status clears approver identity as well as approval",()=>{
 const original={...row("nov20","a",0),approved_by:"commissioner-id"};
 const changed=changeStatus(original,"maybe");
 assert.equal(changed.approval_status,"pending");
 assert.equal(changed.approved_by,null);
 assert.equal(changed.status,"maybe");
});
test("unchanged RSVP status preserves existing approval and approver",()=>{
 const original={...row("nov20","a",0),approved_by:"commissioner-id"};
 assert.deepEqual(changeStatus(original,"playing"),original);
});
test("unrelated event payloads cannot invalidate selected roster",()=>{
 const unrelated={tournament_id:"next",user_id:"other",golfer_index:-1,status:"invalid"};
 assert.deepEqual(approvedRoster([unrelated,row("nov20","a",0)],"nov20",golfers),[0]);
});
