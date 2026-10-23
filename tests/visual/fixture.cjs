// Synthetic data only. This SDK replacement is injected by the test runner, never by the app.
function installFixture({ teamCount = 9, role = 'commissioner', partialDraft = false, signOutFailure = false } = {}) {
  let signedOut=role==='signedout', signOutAttempts=0;
  const user = { id: role === 'commissioner' ? 'visual-owner' : 'visual-player', email: 'visual@example.invalid' };
  const names = ['Alexandra Montgomery', 'Christopher Williamson', 'Jordan Alexander-Smith', 'Taylor Robinson'];
  const golfers = Array.from({ length: teamCount * 4 }, (_, i) => ({
    name: `${names[i % 4]} ${i + 1}`, band: ['A', 'B', 'C', 'D'][i % 4], hcp: 4 + i % 25,
    handicap: 4 + i % 25, self_ranked: true, team: Math.floor(i / 4)
  }));
  const teams = Array.from({ length: teamCount }, (_, i) => ({ name: `Bayou Championship Team ${i + 1}`, captain: golfers[i * 4].name, roster: [0, 1, 2, 3].map(n => i * 4 + n) }));
  const state = { teams, golfers, picks: [], teamCount, golferCount: golfers.length, teamSize: 4,
    teamCountConfirmed: true, playFormatConfirmed: true, playFormat: 'elleng', draftType: 'snake', draftRules: 'banded',
    timerLength: 60, timerPaused: true, timerEndsAt: null, tournamentName: 'EllenG Cup', tournamentDate: '2026-11-20' };
  if(partialDraft){golfers.forEach((g,i)=>g.team=i===0?0:null);teams.forEach((t,i)=>t.roster=i===0?[0]:[]);state.picks=[{team:0,golfer:0}];state.timerPaused=false;state.timerEndsAt=new Date(Date.now()+60000).toISOString();}
  const tables = {
    elleng_tournaments: [{ id: 'elleng-cup', name: 'EllenG Cup', course: 'Bayou Din Golf Club', course_id: 'bayou_din', status: 'live', team_count: teamCount, hole_pars: Array.from({length:18}, (_,i)=>[4,4,3,5,4,4,3,5,4][i%9]), gator_hole: 8 }],
    elleng_drafts: [{ id: 'elleng-cup', owner_id: 'visual-owner', state, updated_at: '2026-10-21T00:00:00Z', tournament_name: 'EllenG Cup', tournament_date: '2026-11-20' }],
    elleng_captains: role==='player'?[]:[{ team_index: partialDraft?1:0, user_id: user.id, captain_name: golfers[0].name }],
    elleng_team_scores: teams.flatMap((_, team_index) => Array.from({ length: 9 }, (_, i) => ({ tournament_id: 'elleng-cup', team_index, hole: i + 1, score: 3 + (team_index + i) % 4 }))),
    elleng_trash_talk: [{ id: 1, display_name: golfers[0].name, team_index: 0, message: 'See everyone at the first tee. Ready for the EllenG Cup!', created_at: '2026-10-21T10:00:00Z' }]
  };
  const accounts = golfers.map((g, i) => ({ golfer_index: i, user_id: `visual-golfer-${i}`, username: `visual${i}`, name: g.name }));
  function query(table) {
    let single = false;
    const chain = { then(resolve, reject) { return Promise.resolve({data: single ? (tables[table]?.[0] || null) : (tables[table] || []), error:null}).then(resolve,reject); } };
    for (const name of ['select','eq','in','order','limit','neq','is']) chain[name] = () => chain;
    chain.single = chain.maybeSingle = () => { single = true; return chain; };
    for (const name of ['insert','upsert','update','delete']) chain[name] = () => { throw new Error(`Fixture forbids database write: ${name}`); };
    return chain;
  }
  const channel = { on() { return this; }, subscribe(cb) { cb?.('SUBSCRIBED'); return this; }, unsubscribe() {} };
  window.supabase = { createClient: () => ({
    from: query,
    auth: { signOut:async()=>{if(signOutFailure&&signOutAttempts++===0)return {error:{message:'Synthetic sign-out unavailable'}};signedOut=true;return {error:null}}, signInWithPassword:async()=>({data:{user:null,session:null},error:{message:'Invalid login credentials'}}), getSession: async()=>({data:{session:signedOut?null:{user}},error:null}), getUser: async()=>({data:{user:signedOut?null:user},error:null}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}) },
    functions: { invoke: async(name, options) => {
      if (name === 'player-profile') return {data:{linked:true,golfer_index:0,username:'visual',must_change_password:false},error:null};
      if (name === 'player-admin' && options?.body?.action === 'list') return {data:{accounts},error:null};
      throw new Error(`Fixture forbids function write: ${name}`);
    } },
    channel:()=>channel, removeChannel:()=>{}, removeAllChannels:()=>{}, rpc:()=>{throw new Error('Fixture forbids RPC');}
  }) };
}
module.exports = { installFixture };
