const test=require("node:test");
const assert=require("node:assert/strict");
const {approvedRoster,changeStatus}=require("../../event-rsvp-eligibility.js");
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
