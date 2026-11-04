const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('scoring.html', 'utf8');
function harness() {
  const timers = [];
  const classes = (initial=[]) => {
    const values = new Set(initial);
    return { add: v=>values.add(v), remove: v=>values.delete(v),
      contains: v=>values.has(v), toggle(v,on){if(on)values.add(v);else values.delete(v);} };
  };
  const names = ['home','leaderboard','players'];
  const views = Object.fromEntries(names.map(name=>[name+'View',{classList:classes(['hidden'])}]));
  const tabs = names.map(view=>({dataset:{view},classList:classes()}));
  const mobile = names.map(mobileView=>({dataset:{mobileView},classList:classes()}));
  const context = {
    user:{id:'golfer'}, isCommissioner:false, captainTeam:null,
    $:id=>views[id], document:{body:{classList:classes()},
      querySelectorAll:selector=>selector==='.view'?Object.values(views):selector==='.tab'?tabs:mobile},
    window:{scrollTo(){}}, requestAnimationFrame:fn=>timers.push(fn),
    setTimeout:fn=>timers.push(fn), enterViewer(){}, renderRankingsDirectory(){}, loadTrashTalk(){}
  };
  vm.createContext(context);
  const landing = source.slice(source.indexOf('function forceSignedInHome(){'), source.indexOf('\nasync function enterApp(){'));
  const navigation = source.slice(source.indexOf('function showView(name){'), source.indexOf('\n$("loginBtn").addEventListener'));
  vm.runInContext(landing+'\n'+navigation, context);
  return {context, views, tabs, mobile, flush:()=>{while(timers.length)timers.shift()();}};
}
test('player landing shows Home before any navigation',()=>{
  const h=harness();h.context.forceSignedInHome();
  assert.equal(h.views.homeView.classList.contains('hidden'),false);
  assert.equal(h.mobile.find(b=>b.dataset.mobileView==='home').classList.contains('active'),true);
});
for(const destination of ['leaderboard','players']) {
  test('delayed player landing cannot replace chosen '+destination+' view',()=>{
    const h=harness();h.context.forceSignedInHome();h.context.showView(destination);h.flush();
    assert.equal(h.views[destination+'View'].classList.contains('hidden'),false);
    assert.equal(h.views.homeView.classList.contains('hidden'),true);
    assert.equal(h.mobile.find(b=>b.dataset.mobileView===destination).classList.contains('active'),true);
    assert.equal(h.tabs.find(b=>b.dataset.view===destination).classList.contains('active'),true);
  });
}
