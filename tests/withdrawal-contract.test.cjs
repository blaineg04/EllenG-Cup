"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const withdrawal=read("db/releases/withdraw-golfer/staged.sql");
const restore=read("db/releases/withdraw-golfer/restore-staged.sql");
const guard=read("db/releases/withdraw-golfer/guard-staged.sql");
const scoreGuard=read("db/releases/withdraw-golfer/score-guard-staged.sql");
const ui=read("scoring.html");
test("commissioner RPCs require authentication, ownership, setup and optimistic concurrency",()=>{
 for(const sql of [withdrawal,restore]){
  assert.match(sql,/auth\.uid\(\) IS NULL/);
  assert.match(sql,/d\.owner_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(sql,/t\.status IS DISTINCT FROM 'setup'/);
  assert.match(sql,/d\.updated_at IS DISTINCT FROM p_expected_updated_at/);
  assert.match(sql,/jsonb_array_length\(s->'picks'\)\s*(?:<>|=)\s*23/);
  for(const table of ["elleng_team_scores","elleng_player_hole_scores","elleng_pair_hole_scores"])
   assert.ok(sql.includes(table),`missing score guard ${table}`);
 }
});
test("withdraw and restore retain draft picks, teams, and indexes",()=>{
 for(const sql of [withdrawal,restore]){
  assert.match(sql,/jsonb_set\(s,ARRAY\['golfers',p_golfer_index::text\],/);
  assert.doesNotMatch(sql,/UPDATE\s+public\.elleng_captains/i);
 }
 assert.match(guard,/old\.state->'picks'=new\.state->'picks'/);
 assert.match(guard,/old\.state->'teams'=new\.state->'teams'/);
 assert.match(guard,/old\.state - 'golfers'=new\.state - 'golfers'/);
});
test("server rejects stale withdrawn golfer score writes",()=>{
 assert.match(scoreGuard,/BEFORE INSERT OR UPDATE ON public\.elleng_player_hole_scores/);
 assert.match(scoreGuard,/FOR SHARE OF d/);
 assert.doesNotMatch(scoreGuard,/\\\\n --/,"SQL must contain actual line breaks, not escaped text");
 assert.match(scoreGuard,/v_golfer->>'withdrawn'='true'/);
 assert.match(scoreGuard,/v_golfer->>'participating'='false'/);
});
test("UI keeps commissioner controls and active-roster filtering",()=>{
 for(const id of ["withdrawGolferBtn","restoreGolferBtn","withdrawGolferSelect","restoreGolferSelect"])
  assert.ok(ui.includes(`id="${id}"`),`missing control ${id}`);
 assert.match(ui,/if\(typeof r==="number"\)return golfers\[r\]\?\.participating===false/);
 assert.match(ui,/Withdrawn — /);
});

test("commissioner withdrawal refreshes both dropdowns after successful reload",()=>{
 const withdraw=ui.indexOf('$("withdrawGolferBtn").addEventListener("click"');
 const addLate=ui.indexOf('$("addLateGolferBtn").addEventListener("click"',withdraw);
 assert.ok(withdraw>=0&&addLate>withdraw,"withdrawal click handler missing");
 const handler=ui.slice(withdraw,addLate);
 assert.match(handler,/await loadBase\(\);renderAll\(\);refreshWithdrawalChoices\(\);refreshRestoreChoices\(\);/);
 assert.match(handler,/if\(!confirm\(/,"withdrawal must require confirmation");
 assert.match(handler,/if\(!isCommissioner\)/,"withdrawal must check commissioner role");
});

test("commissioner render populates both withdrawal dropdowns without focus",()=>{
 const start=ui.indexOf("function renderAdmin(){");
 const end=ui.indexOf("async function refreshLiveHandicapsBeforeStateSave",start);
 assert.ok(start>=0&&end>start,"commissioner render function not found");
 const render=ui.slice(start,end);
 assert.match(render,/refreshWithdrawalChoices\(\);\s*refreshRestoreChoices\(\);/);
});
