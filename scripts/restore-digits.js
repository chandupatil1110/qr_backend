// Repairs QR extension codes (qrdata.digits) after the accidental re-run
// of migration 008, which renumbered every QR to 0001, 0002, ...
//
//   • Sticker QRs are restored from manual_qr.digits — the code printed on
//     the sticker. Exact, no input needed.
//   • App-purchased QRs: their original codes aren't stored anywhere else
//     in the database, so you pass them on the command line, as
//     <qr_id>=<code>, taken from the invoice email or the owner's sticker
//     (its QR link ends in ?digits=XXXXX). QRs you don't pass are left as
//     they are and listed at the end.
//   • Drops the stray qrdata_digits_seq sequence that 008 re-created
//     (nothing uses it).
//
// DRY RUN by default — shows what would change and changes nothing.
// Add --apply to write. Everything runs in ONE transaction: any error or
// duplicate code rolls back all of it.
//
//   node scripts/restore-digits.js                      # dry run
//   node scripts/restore-digits.js 2=00001 3=00002      # dry run with codes
//   node scripts/restore-digits.js 2=00001 3=00002 9=00004 --apply
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const manualMap = new Map();
for (const a of args.filter((x) => x !== '--apply')) {
  const m = /^(\d+)=(\d{5})$/.exec(a);
  if (!m) {
    console.error(`Bad argument "${a}". Use <qr_id>=<5-digit code>, e.g. 2=00001`);
    process.exit(1);
  }
  manualMap.set(Number(m[1]), m[2]);
}

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: /supabase.(co|com)/i.test(process.env.DATABASE_URL || '')
    ? { rejectUnauthorized: false }
    : false,
});
await c.connect();

try {
  await c.query('BEGIN');
  const rows = (await c.query(`
    SELECT q.id, q.unique_id, q.digits AS current, q.is_manual,
           mq.digits AS printed
      FROM qrdata q
      LEFT JOIN manual_qr mq ON mq.qr_unique_id = q.unique_id
     ORDER BY q.id`)).rows;

  const plan = [];
  const unresolved = [];
  for (const r of rows) {
    let target = null;
    let source = '';
    if (r.printed) {
      target = r.printed;
      source = 'printed sticker code';
    } else if (manualMap.has(r.id)) {
      target = manualMap.get(r.id);
      source = 'given on command line';
    }
    if (target == null) {
      if (r.current.length < 5) unresolved.push(r);
      continue;
    }
    plan.push({ qr_id: r.id, unique_id: r.unique_id, from: r.current, to: target, source });
  }
  for (const id of manualMap.keys()) {
    const r = rows.find((x) => x.id === id);
    if (!r) throw new Error(`QR id ${id} does not exist`);
    if (r.printed) throw new Error(`QR id ${id} is a sticker QR — its code comes from the sticker, don't pass it`);
  }

  console.log('\nPlanned changes:');
  console.table(plan);

  // Free every code we're about to assign, then assign — avoids
  // tripping the UNIQUE(digits) constraint mid-way.
  for (const p of plan) {
    await c.query(`UPDATE qrdata SET digits = $2 WHERE id = $1`, [p.qr_id, `tmp${p.qr_id}`]);
  }
  for (const p of plan) {
    await c.query(`UPDATE qrdata SET digits = $2 WHERE id = $1`, [p.qr_id, p.to]);
  }
  await c.query(`DROP SEQUENCE IF EXISTS qrdata_digits_seq`);

  console.log('\nResult (inside the transaction):');
  console.table((await c.query(
    `SELECT id, digits, is_manual FROM qrdata ORDER BY id`)).rows);

  if (unresolved.length) {
    console.log('\nStill NOT restored (app-purchased, need their original code):');
    console.table(unresolved.map((r) => ({ qr_id: r.id, unique_id: r.unique_id, current: r.current })));
  }

  if (apply) {
    await c.query('COMMIT');
    console.log('\nAPPLIED.');
  } else {
    await c.query('ROLLBACK');
    console.log('\nDRY RUN — nothing was changed. Add --apply to write.');
  }
} catch (e) {
  await c.query('ROLLBACK').catch(() => {});
  console.error('\nFAILED, nothing was changed:', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
