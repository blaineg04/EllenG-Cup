// Disposable multi-session persistence contract. No network or production data.
const assert = require('node:assert/strict');
const {PGlite} = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE rehearsal_scores (
    golfer integer NOT NULL, hole integer NOT NULL, strokes integer NOT NULL CHECK(strokes > 0),
    editor text NOT NULL, PRIMARY KEY(golfer,hole)
  ); CREATE TABLE rehearsal_accounts (actor text PRIMARY KEY, golfer integer, role text NOT NULL);`);
  await db.query("INSERT INTO rehearsal_accounts(actor,golfer,role) VALUES ('commissioner',NULL,'commissioner'),('golfer-a',0,'player'),('golfer-b',1,'player')");
  async function save(actor, golfer, hole, strokes) {
    const account=(await db.query('SELECT * FROM rehearsal_accounts WHERE actor=$1',[actor])).rows[0];
    assert(account, 'Authenticated actor required');
    if (account.role!=='commissioner' && account.golfer!==golfer) throw Error('Not authorized to edit another golfer');
    await db.query(`INSERT INTO rehearsal_scores(golfer,hole,strokes,editor)
      VALUES($1,$2,$3,$4) ON CONFLICT(golfer,hole)
      DO UPDATE SET strokes=excluded.strokes,editor=excluded.editor`,[golfer,hole,strokes,actor]);
  }
  await save('golfer-a',0,1,4);
  await save('golfer-b',1,1,5);
  assert.deepEqual((await db.query('SELECT golfer,strokes FROM rehearsal_scores ORDER BY golfer')).rows.map(x=>[x.golfer,x.strokes]),[[0,4],[1,5]]);
  await assert.rejects(save('golfer-b',0,1,3),/Not authorized/);
  assert.equal((await db.query('SELECT strokes FROM rehearsal_scores WHERE golfer=0 AND hole=1')).rows[0].strokes,4);
  await save('golfer-a',0,1,3);
  assert.equal((await db.query('SELECT strokes FROM rehearsal_scores WHERE golfer=0 AND hole=1')).rows[0].strokes,3);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM rehearsal_scores')).rows[0].n,2);
  console.log('PASS: two synthetic golfer sessions, persisted upserts, cross-account edit denial, no duplicate score rows');
  console.log('LIMITATION: standalone database contract, not app RPC/auth/browser end-to-end');
  await db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
